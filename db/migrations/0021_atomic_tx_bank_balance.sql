-- =============================================================================
-- Migration 0021: Atomic bank-account balance updates with transactions
--
-- Ensures that creating or deleting a bank-mode transaction and updating the
-- linked bank account balance happen in the same database transaction, so the
-- ledger and card balance can never diverge.
-- =============================================================================

-- ---------------------------------------------------------------------------- -
-- 1. Guard: prevent direct writes to transactions.bank_account_id / balance
--    bypassing the RPCs
-- ---------------------------------------------------------------------------- -

create or replace function public.prevent_unmanaged_transaction_bank_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow writes going through the atomic transaction RPC, or the wallet RPCs
  -- (which already update wallet + bank balances atomically in the same call).
  if coalesce(current_setting('rupa.tx_bank_rpc', true), '') = 'on'
     or coalesce(current_setting('rupa.wallet_rpc', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- INSERT: block only when a bank_account_id is being newly attached.
  if tg_op = 'INSERT' then
    if new.bank_account_id is not null then
      raise exception 'Bank-account linked transactions must be created through the atomic RPC.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: block only when bank_account_id is being set or changed.
  if tg_op = 'UPDATE' then
    if (new.bank_account_id is not null and old.bank_account_id is null)
       or (new.bank_account_id is not null
           and old.bank_account_id is not null
           and new.bank_account_id <> old.bank_account_id) then
      raise exception 'Bank-account link changes must be made through the atomic RPC.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- DELETE: allow at the database layer; balance revert is handled by the
  -- service layer via delete_transaction_with_balance_update().
  return old;
end;
$$;

drop trigger if exists transaction_bank_write_guard on public.transactions;
create trigger transaction_bank_write_guard
before insert or update or delete on public.transactions
for each row execute function public.prevent_unmanaged_transaction_bank_writes();

-- ---------------------------------------------------------------------------- -
-- 2. Atomic transaction creation with bank balance update
-- ---------------------------------------------------------------------------- -

create or replace function public.create_transaction_with_balance_update(
  p_owner_id uuid,
  p_amount numeric,
  p_direction text,
  p_occurred_on date,
  p_category_id uuid default null,
  p_notes text default null,
  p_source text default 'manual',
  p_source_ref_id uuid default null,
  p_payment_mode text default 'cash',
  p_bank_account_id uuid default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tx_id uuid := gen_random_uuid();
  delta numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  if p_owner_id <> auth.uid() then
    raise exception 'Cannot create transaction for another user.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.tx_bank_rpc', 'on', true);

  -- Insert the transaction row.
  insert into public.transactions (
    id, owner_id, occurred_on, amount, direction, category_id, notes,
    source, source_ref_id, payment_mode, bank_account_id
  ) values (
    new_tx_id, p_owner_id, coalesce(p_occurred_on, current_date),
    round(p_amount, 2), p_direction, p_category_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_source, p_source_ref_id, p_payment_mode, p_bank_account_id
  );

  -- If bank-mode, update the linked bank account balance in the same transaction.
  if p_payment_mode = 'bank' and p_bank_account_id is not null then
    delta := round(p_amount, 2);

    -- Lock the bank account row to prevent concurrent balance races.
    perform id
    from public.bank_accounts
    where id = p_bank_account_id and owner_id = p_owner_id
    for update;

    if p_direction = 'in' then
      update public.bank_accounts
      set balance = balance + delta
      where id = p_bank_account_id and owner_id = p_owner_id;
    else
      update public.bank_accounts
      set balance = balance - delta
      where id = p_bank_account_id and owner_id = p_owner_id;
    end if;
  end if;

  return query
  select * from public.transactions where id = new_tx_id;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 3. Atomic transaction deletion with bank balance revert
-- ---------------------------------------------------------------------------- -

create or replace function public.delete_transaction_with_balance_update(
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_tx public.transactions%rowtype;
  delta numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.tx_bank_rpc', 'on', true);

  -- Lock and fetch the transaction to delete.
  select * into current_tx
  from public.transactions
  where id = p_transaction_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Transaction not found.' using errcode = 'P0001';
  end if;

  -- Revert bank account balance if this was a bank-mode transaction.
  if current_tx.payment_mode = 'bank' and current_tx.bank_account_id is not null then
    delta := round(current_tx.amount, 2);

    perform id
    from public.bank_accounts
    where id = current_tx.bank_account_id and owner_id = auth.uid()
    for update;

    if current_tx.direction = 'in' then
      -- Removing an 'in' transaction decreases the balance.
      update public.bank_accounts
      set balance = balance - delta
      where id = current_tx.bank_account_id and owner_id = auth.uid();
    else
      -- Removing an 'out' transaction increases the balance.
      update public.bank_accounts
      set balance = balance + delta
      where id = current_tx.bank_account_id and owner_id = auth.uid();
    end if;
  end if;

  delete from public.transactions
  where id = p_transaction_id and owner_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 4. One-time migration: assign unassigned bank transactions to an account
-- ---------------------------------------------------------------------------- -

create or replace function public.assign_transactions_to_account(
  p_account_id uuid,
  p_transaction_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.tx_bank_rpc', 'on', true);

  update public.transactions
  set bank_account_id = p_account_id,
      payment_mode = 'bank'
  where id = any(p_transaction_ids)
    and owner_id = auth.uid()
    and payment_mode = 'bank'
    and bank_account_id is null;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 5. Permissions
-- ---------------------------------------------------------------------------- -

grant execute on function public.create_transaction_with_balance_update(uuid, numeric, text, date, uuid, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.delete_transaction_with_balance_update(uuid) to authenticated;
grant execute on function public.assign_transactions_to_account(uuid, uuid[]) to authenticated;

revoke execute on function public.create_transaction_with_balance_update(uuid, numeric, text, date, uuid, text, text, uuid, text, uuid) from public, anon;
revoke execute on function public.delete_transaction_with_balance_update(uuid) from public, anon;
revoke execute on function public.assign_transactions_to_account(uuid, uuid[]) from public, anon;
