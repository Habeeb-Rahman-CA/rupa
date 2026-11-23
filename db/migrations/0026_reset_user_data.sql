-- =============================================================================
-- Migration 0026: reset_user_data — selective bulk wipe of one user's data
--
-- Powers Settings → "Reset user data". The user picks groups of data
-- (ledger, debts, cards, wallets, …), confirms with their account password in
-- the client, and this RPC deletes the chosen rows in a single transaction.
--
-- Design notes
--   * SECURITY DEFINER, but every statement still filters on
--     `owner_id = auth.uid()` explicitly — never trusts the caller.
--   * The wallet / transfer / bank guard triggers only allow writes through
--     their RPCs; the `rupa.*` GUCs are set for the duration of the
--     transaction (`is_local => true`, so they reset automatically).
--   * Balance integrity: the effect of every bank-mode / wallet transaction
--     being deleted is reverted FIRST on the surviving rows, so a kept card
--     or wallet always equals the sum of the ledger rows that remain.
--     (Opening balances are ledger entries too — see 0006 — so a fully wiped
--     ledger correctly leaves kept accounts at 0.)
--   * Dependency closure: groups that other rows reference with
--     ON DELETE RESTRICT are force-included below. The client mirrors this
--     map so the dialog can show linked groups as pre-checked & locked.
--   * Money-held rows are deleted "returned" first: the
--     prevent_over_returned_money trigger rejects a delete that would
--     temporarily leave returned > received.
-- =============================================================================

create or replace function public.reset_user_data(p_tables text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_sel          text[];
  v_prev         text[];
  v_tx_ids       uuid[];
  v_wt_ids       uuid[];
  v_transfer_ids uuid[];
  v_counts       jsonb := '{}'::jsonb;
  v_n            integer;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  if p_tables is null or cardinality(p_tables) = 0 then
    raise exception 'No data groups selected.' using errcode = 'P0001';
  end if;

  -- Whitelist: no arbitrary table names ever reach a DELETE.
  if exists (
    select 1 from unnest(p_tables) t
    where t not in (
      'transactions', 'debts', 'cards', 'wallets', 'transfers', 'money_held',
      'subscriptions', 'interest', 'budgets', 'categories', 'people',
      'app_settings'
    )
  ) then
    raise exception 'Unknown data group.' using errcode = 'P0001';
  end if;

  select array_agg(distinct x) into v_sel from unnest(p_tables) x;

  -- ---------------------------------------------------------------------
  -- Dependency closure (fixpoint). Mirrored by ResetDataService on the
  -- client so the UI shows these as checked + locked:
  --   transactions → debts, transfers   (deleting the ledger removes debt
  --                                      payment rows & restores outstanding;
  --                                      transfer rows would lose their ledger
  --                                      links and balances)
  --   people       → debts, money_held  (person_id is ON DELETE RESTRICT)
  --   cards        → transfers, interest, wallets
  --                                      (source/destination/bank_account_id
  --                                      are ON DELETE RESTRICT; wallet rows
  --                                      funded by a card can't be kept —
  --                                      partial wallet-ledger deletion could
  --                                      drive wallets.balance below its
  --                                      >= 0 check — so wallets go together
  --                                      with the cards)
  -- ---------------------------------------------------------------------
  loop
    v_prev := v_sel;
    if 'transactions' = any(v_sel) then
      v_sel := v_sel || array['debts', 'transfers'];
    end if;
    if 'people' = any(v_sel) then
      v_sel := v_sel || array['debts', 'money_held'];
    end if;
    if 'cards' = any(v_sel) then
      v_sel := v_sel || array['transfers', 'interest', 'wallets'];
    end if;
    select array_agg(distinct x) into v_sel from unnest(v_sel) x;
    exit when v_sel = v_prev;
  end loop;

  -- Guard triggers must see the RPC flags for the whole transaction.
  perform set_config('rupa.wallet_rpc', 'on', true);
  perform set_config('rupa.transfer_rpc', 'on', true);
  perform set_config('rupa.tx_bank_rpc', 'on', true);

  -- ---------------------------------------------------------------------
  -- 1. Compute exactly which rows die, before touching anything.
  -- ---------------------------------------------------------------------

  -- Transfers: whole group, plus forced by cards / transactions.
  if 'transfers' = any(v_sel) then
    select array_agg(id) into v_transfer_ids
    from public.transfers where owner_id = v_uid;
  end if;
  v_transfer_ids := coalesce(v_transfer_ids, array[]::uuid[]);

  -- Wallet ledger rows: all or nothing — wallets/transactions selected (or
  -- forced in by cards) wipes every wallet row; otherwise none are touched.
  if 'wallets' = any(v_sel) or 'transactions' = any(v_sel) then
    select array_agg(id) into v_wt_ids
    from public.wallet_transactions where owner_id = v_uid;
  end if;
  v_wt_ids := coalesce(v_wt_ids, array[]::uuid[]);

  -- Ledger rows:
  --   transactions selected → the whole ledger;
  --   otherwise the union of the rows the chosen groups actually own:
  --     wallets    → wallet-linked transactions (wallet_id is RESTRICT)
  --     transfers  → their debit/credit rows (mirrors delete_account_transfer)
  if 'transactions' = any(v_sel) then
    select array_agg(id) into v_tx_ids
    from public.transactions where owner_id = v_uid;
  else
    select array_agg(t.id) into v_tx_ids
    from public.transactions t
    where t.owner_id = v_uid
      and (
        ('wallets' = any(v_sel) and t.wallet_id is not null)
        or ('transfers' = any(v_sel)
            and t.source = 'transfer'
            and t.source_ref_id = any(v_transfer_ids))
      );
  end if;
  v_tx_ids := coalesce(v_tx_ids, array[]::uuid[]);

  -- ---------------------------------------------------------------------
  -- 2. Revert balance effects on SURVIVING rows before deleting anything.
  --    (Harmless when the account itself is about to be deleted too.)
  -- ---------------------------------------------------------------------

  -- Cards: balance = Σ(net of remaining ledger rows) → undo the dying rows.
  update public.bank_accounts ba
  set balance = ba.balance - agg.net
  from (
    select t.bank_account_id,
           sum(case when t.direction = 'in' then t.amount else -t.amount end) as net
    from public.transactions t
    where t.id = any(v_tx_ids)
      and t.payment_mode = 'bank'
      and t.bank_account_id is not null
    group by t.bank_account_id
  ) agg
  where ba.id = agg.bank_account_id
    and ba.owner_id = v_uid;

  -- Wallets: recharge added, spend subtracted → undo the dying wallet rows.
  update public.wallets w
  set balance = w.balance - agg.net
  from (
    select wt.wallet_id,
           sum(case when wt.kind = 'recharge' then wt.amount else -wt.amount end) as net
    from public.wallet_transactions wt
    where wt.id = any(v_wt_ids)
    group by wt.wallet_id
  ) agg
  where w.id = agg.wallet_id
    and w.owner_id = v_uid;

  -- ---------------------------------------------------------------------
  -- 3. Delete in dependency order.
  -- ---------------------------------------------------------------------

  if 'app_settings' = any(v_sel) then
    delete from public.push_notification_log where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('push_notification_log', v_n);
  end if;

  if 'subscriptions' = any(v_sel) then
    -- price changes / renewals / payments cascade.
    delete from public.subscriptions where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('subscriptions', v_n);
  end if;

  if cardinality(v_wt_ids) > 0 then
    delete from public.wallet_transactions
    where owner_id = v_uid and id = any(v_wt_ids);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('wallet_transactions', v_n);
  end if;

  if cardinality(v_transfer_ids) > 0 then
    delete from public.transfers
    where owner_id = v_uid and id = any(v_transfer_ids);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('transfers', v_n);
  end if;

  if 'interest' = any(v_sel) then
    delete from public.interest_disposals where owner_id = v_uid;
    delete from public.interest_entries where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('interest_entries', v_n);
  end if;

  if 'money_held' = any(v_sel) then
    -- Returned rows first so prevent_over_returned_money never trips.
    delete from public.money_held_transactions
    where owner_id = v_uid and direction = 'returned';
    delete from public.money_held_transactions where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('money_held_transactions', v_n);
    delete from public.money_held_people where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('money_held_people', v_n);
  end if;

  if 'debts' = any(v_sel) then
    -- debt_payments cascade (and its outstanding-restore trigger only ever
    -- touches the debt rows being deleted right here).
    delete from public.debts where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('debts', v_n);
  end if;

  if cardinality(v_tx_ids) > 0 then
    delete from public.transactions
    where owner_id = v_uid and id = any(v_tx_ids);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('transactions', v_n);
  end if;

  if 'wallets' = any(v_sel) then
    delete from public.wallets where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('wallets', v_n);
  end if;

  if 'cards' = any(v_sel) then
    delete from public.bank_accounts where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('bank_accounts', v_n);
  end if;

  if 'people' = any(v_sel) then
    delete from public.people where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('people', v_n);
  end if;

  if 'budgets' = any(v_sel) then
    delete from public.budgets where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('budgets', v_n);
  end if;

  if 'categories' = any(v_sel) then
    delete from public.categories where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('categories', v_n);
  end if;

  if 'app_settings' = any(v_sel) then
    delete from public.app_settings where owner_id = v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('app_settings', v_n);
  end if;

  return jsonb_build_object(
    'tables',  to_jsonb(v_sel),
    'deleted', v_counts
  );
end;
$$;

-- ---------------------------------------------------------------------------- -
-- Permissions
-- ---------------------------------------------------------------------------- -

grant execute on function public.reset_user_data(text[]) to authenticated;
revoke execute on function public.reset_user_data(text[]) from public, anon;
