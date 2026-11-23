-- =============================================================================
-- Integration test for public.reset_user_data (migration 0026).
--
-- Run AFTER db/tests/auth-stub-setup.sql + all db/migrations/*.sql, against a
-- throwaway local Postgres (see the header of auth-stub-setup.sql).
--
-- Scenarios:
--   S0  baseline seed sanity
--   S1  transfers only   — wipe + card balance reverts, neighbours untouched
--   S2  wallets only     — wipe + card balance reverts
--   S3  cards only       — forced transfers/interest/wallets, kept links nulled
--   S4  transactions only— forced debts/transfers, kept cards/wallets → 0
--   S5  people only      — forced debts/money-held, everything else untouched
--   S6  full wipe        — every u1 table empty, u2 fully isolated
--   S7  guard rails      — unknown group / empty selection / signed-out call
--   S8  closure report   — forced groups + deleted row counts in the jsonb
--   S9  permissions      — authenticated granted, anon revoked
-- =============================================================================
\set ON_ERROR_STOP on

-- ============================================================ helpers
create or replace function ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond then
    raise notice 'PASS: %', msg;
  else
    raise exception 'FAIL: %', msg;
  end if;
end $$;

-- Seeds a full, realistic dataset for u1 and a small one for u2.
create or replace function reseed() returns void
language plpgsql as $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  p1 uuid := '55000000-0000-0000-0000-000000000001';
  cat_exp uuid;
begin
  -- seed as the app's RPCs would: satisfy the wallet/transfer/bank guards
  perform set_config('rupa.tx_bank_rpc', 'on', true);
  perform set_config('rupa.wallet_rpc', 'on', true);
  perform set_config('rupa.transfer_rpc', 'on', true);

  truncate table
    public.wallet_transactions, public.wallets, public.transfers,
    public.subscription_payments, public.subscription_renewals, public.subscriptions,
    public.money_held_transactions, public.money_held_people,
    public.debt_payments, public.debts, public.transactions, public.bank_accounts,
    public.budgets, public.categories, public.people,
    public.interest_disposals, public.interest_entries,
    public.app_settings, public.push_notification_log
    restart identity cascade;

  -- u2's untouched reference data ----------------------------------------
  insert into public.categories (owner_id, name, kind) values (u2, 'Other', 'expense');
  insert into public.bank_accounts
    (id, owner_id, bank_name, account_name, card_type, payment_network,
     card_number_masked, expiry_date, cardholder_name, balance)
  values
    ('10000000-0000-0000-0000-000000000009', u2, 'HDFC', 'Other', 'credit', 'visa',
     '**** 9999', '12/30', 'Other', 42);
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, payment_mode, bank_account_id)
  values
    ('f0000000-0000-0000-0000-000000000099', u2, '2026-01-01', 42, 'in', 'manual',
     'bank', '10000000-0000-0000-0000-000000000009');

  -- u1: master data ------------------------------------------------------
  insert into public.categories (owner_id, name, kind) values
    (u1, 'Groceries', 'expense'), (u1, 'Salary', 'income');
  select id into cat_exp from public.categories where owner_id = u1 and kind = 'expense';
  insert into public.people (id, owner_id, name)
  values (p1, u1, 'Asha');

  -- u1: cards (balances finalise below)
  insert into public.bank_accounts
    (id, owner_id, bank_name, account_name, card_type, payment_network,
     card_number_masked, expiry_date, cardholder_name, balance)
  values
    ('10000000-0000-0000-0000-000000000001', u1, 'HDFC', 'Main', 'credit', 'visa',
     '**** 1111', '12/28', 'Asha', 0),
    ('10000000-0000-0000-0000-000000000002', u1, 'SBI', 'Backup', 'debit', 'rupay',
     '**** 2222', '12/27', 'Asha', 0);

  -- u1: ledger ------------------------------------------------------------
  -- t1/t2  opening balances (bank)
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, payment_mode, bank_account_id)
  values
    ('f0000000-0000-0000-0000-000000000001', u1, '2026-01-01', 1000, 'in', 'opening',
     'bank', '10000000-0000-0000-0000-000000000001'),
    ('f0000000-0000-0000-0000-000000000002', u1, '2026-01-01', 500, 'in', 'opening',
     'bank', '10000000-0000-0000-0000-000000000002');

  -- t3 manual cash expense
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, payment_mode)
  values
    ('f0000000-0000-0000-0000-000000000003', u1, '2026-01-05', 200, 'out', 'manual', 'cash');

  -- t4 debt payment (cash) + d1/dp1
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, payment_mode)
  values
    ('f0000000-0000-0000-0000-000000000004', u1, '2026-02-01', 100, 'out', 'debt', 'cash');
  insert into public.debts (id, owner_id, person_id, direction, principal, outstanding)
  values ('50000000-0000-0000-0000-000000000001', u1, p1, 'they_owe', 300, 200);
  insert into public.debt_payments (id, debt_id, amount, paid_on, transaction_id)
  values ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
          100, '2026-02-01', 'f0000000-0000-0000-0000-000000000004');

  -- transfer cardA → cardB 100 (t5/t6)
  insert into public.transfers
    (id, owner_id, source_account_id, destination_account_id, amount)
  values
    ('40000000-0000-0000-0000-000000000001', u1,
     '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
     100);
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, source_ref_id,
     payment_mode, bank_account_id)
  values
    ('f0000000-0000-0000-0000-000000000005', u1, '2026-02-10', 100, 'out', 'transfer',
     '40000000-0000-0000-0000-000000000001', 'bank',
     '10000000-0000-0000-0000-000000000001'),
    ('f0000000-0000-0000-0000-000000000006', u1, '2026-02-10', 100, 'in', 'transfer',
     '40000000-0000-0000-0000-000000000001', 'bank',
     '10000000-0000-0000-0000-000000000002');
  update public.transfers
  set debit_transaction_id = 'f0000000-0000-0000-0000-000000000005',
      credit_transaction_id = 'f0000000-0000-0000-0000-000000000006'
  where id = '40000000-0000-0000-0000-000000000001';

  -- wallet w1: 40 balance (recharge 100 from cardA, spend 60)
  insert into public.wallets (id, owner_id, name, initial_balance, balance)
  values ('20000000-0000-0000-0000-000000000001', u1, 'Pocket', 0, 40);
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, source_ref_id,
     payment_mode, bank_account_id, wallet_id)
  values
    ('f0000000-0000-0000-0000-000000000007', u1, '2026-03-01', 100, 'out', 'wallet_recharge',
     '30000000-0000-0000-0000-000000000001', 'bank',
     '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
    ('f0000000-0000-0000-0000-000000000008', u1, '2026-03-01', 100, 'in', 'wallet_recharge',
     '30000000-0000-0000-0000-000000000001', 'cash', null,
     '20000000-0000-0000-0000-000000000001'),
    ('f0000000-0000-0000-0000-000000000009', u1, '2026-03-05', 60, 'out', 'wallet_spend',
     '30000000-0000-0000-0000-000000000002', 'cash', null,
     '20000000-0000-0000-0000-000000000001');
  insert into public.wallet_transactions
    (id, owner_id, wallet_id, kind, amount, funding_mode, bank_account_id,
     debit_transaction_id, credit_transaction_id)
  values
    ('30000000-0000-0000-0000-000000000001', u1, '20000000-0000-0000-0000-000000000001',
     'recharge', 100, 'bank', '10000000-0000-0000-0000-000000000001',
     'f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000008'),
    ('30000000-0000-0000-0000-000000000002', u1, '20000000-0000-0000-0000-000000000001',
     'spend', 60, null, null,
     'f0000000-0000-0000-0000-000000000009', null);

  -- money held for others (received 400, returned 150)
  insert into public.money_held_people (id, owner_id, person_id)
  values ('60000000-0000-0000-0000-000000000001', u1, p1);
  insert into public.money_held_transactions (owner_id, held_person_id, direction, amount)
  values
    (u1, '60000000-0000-0000-0000-000000000001', 'received', 400),
    (u1, '60000000-0000-0000-0000-000000000001', 'returned', 150);

  -- subscription + renewal + payment (linked to t10)
  insert into public.transactions
    (id, owner_id, occurred_on, amount, direction, source, payment_mode)
  values
    ('f0000000-0000-0000-0000-000000000010', u1, '2026-04-01', 199, 'out', 'subscription', 'cash');
  insert into public.subscriptions
    (id, owner_id, name, amount, billing_cycle, start_date, next_renewal_date, payment_account_id)
  values
    ('70000000-0000-0000-0000-000000000001', u1, 'Netflix', 199, 'monthly',
     '2026-01-01', '2026-12-01', '10000000-0000-0000-0000-000000000001');
  insert into public.subscription_renewals
    (id, owner_id, subscription_id, due_on, renewed_on, amount)
  values
    ('70000000-0000-0000-0000-000000000002', u1, '70000000-0000-0000-0000-000000000001',
     '2026-11-01', '2026-11-01', 199);
  insert into public.subscription_payments
    (id, owner_id, subscription_id, renewal_id, amount, paid_on, transaction_id)
  values
    ('70000000-0000-0000-0000-000000000003', u1, '70000000-0000-0000-0000-000000000001',
     '70000000-0000-0000-0000-000000000002', 199, '2026-11-01',
     'f0000000-0000-0000-0000-000000000010');

  -- interest entry + disposal
  insert into public.interest_entries (id, owner_id, bank_account_id, amount, stage)
  values ('80000000-0000-0000-0000-000000000001', u1,
          '10000000-0000-0000-0000-000000000001', 50, 'received');
  insert into public.interest_disposals (id, owner_id, entry_id, amount)
  values ('80000000-0000-0000-0000-000000000002', u1,
          '80000000-0000-0000-0000-000000000001', 50);

  -- budget, app settings, push log
  insert into public.budgets (owner_id, name, category_id, amount, start_date, end_date)
  values (u1, 'Monthly food', cat_exp, 5000, '2026-11-01', '2026-11-30');
  insert into public.app_settings (owner_id) values (u1);
  insert into public.push_notification_log (owner_id, category, ref)
  values (u1, 'renewals', 'sub:70000000:2026-11-20');

  -- final card balances: A = 1000-100-100 = 800, B = 500+100 = 600
  update public.bank_accounts set balance = 800
    where id = '10000000-0000-0000-0000-000000000001';
  update public.bank_accounts set balance = 600
    where id = '10000000-0000-0000-0000-000000000002';
end $$;

-- convenience: count rows of a table for u1 (or all rows for child tables
-- like debt_payments that have no owner_id of their own)
create or replace function cnt(t text) returns bigint
language plpgsql as $$
declare
  n bigint;
  has_owner boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = 'owner_id'
  ) into has_owner;

  if has_owner then
    execute format('select count(*) from public.%I where owner_id = $1', t)
      into n using '11111111-1111-1111-1111-111111111111'::uuid;
  else
    execute format('select count(*) from public.%I', t) into n;
  end if;
  return n;
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.com')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- ============================================================ S0 baseline
select reseed();
do $$ begin
  perform ok(cnt('transactions') = 10, 'S0 seed: 10 ledger rows');
  perform ok((select count(*) from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000001' and balance = 800) = 1,
             'S0 seed: card A balance 800');
  perform ok((select balance from public.wallets
              where id = '20000000-0000-0000-0000-000000000001') = 40,
             'S0 seed: wallet balance 40');
end $$;

-- ============================================================ S1 transfers only
select reseed();
select public.reset_user_data(array['transfers']);
do $$ begin
  perform ok(cnt('transfers') = 0, 'S1 transfers wiped');
  perform ok(cnt('transactions') = 8, 'S1 transfer ledger rows gone (10→8)');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000001') = 900,
             'S1 card A balance reverted to 900');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000002') = 500,
             'S1 card B balance reverted to 500');
  perform ok(cnt('wallets') = 1 and cnt('wallet_transactions') = 2, 'S1 wallets untouched');
  perform ok(cnt('debts') = 1 and cnt('people') = 1, 'S1 debts/people untouched');
  perform ok(cnt('interest_entries') = 1 and cnt('interest_disposals') = 1,
             'S1 interest untouched');
  perform ok(cnt('subscriptions') = 1 and cnt('subscription_payments') = 1,
             'S1 subscriptions untouched');
  perform ok(cnt('money_held_transactions') = 2, 'S1 money held untouched');
end $$;

-- ============================================================ S2 wallets only
select reseed();
select public.reset_user_data(array['wallets']);
do $$ begin
  perform ok(cnt('wallets') = 0 and cnt('wallet_transactions') = 0, 'S2 wallets wiped');
  perform ok(cnt('transactions') = 7, 'S2 wallet ledger rows gone (10→7)');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000001') = 900,
             'S2 card A recharged-back to 900');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000002') = 600,
             'S2 card B untouched (600)');
  perform ok(cnt('transfers') = 1, 'S2 transfers untouched');
  perform ok(cnt('debts') = 1 and cnt('people') = 1, 'S2 debts/people untouched');
  perform ok(cnt('categories') = 2 and cnt('budgets') = 1, 'S2 categories/budgets untouched');
end $$;

-- ============================================================ S3 cards only
-- (forces transfers, interest, wallets — incl. the wallet whose spent
--  recharge used to risk a negative-balance check)
select reseed();
select public.reset_user_data(array['cards']);
do $$ begin
  perform ok(cnt('bank_accounts') = 0, 'S3 cards wiped');
  perform ok(cnt('transfers') = 0, 'S3 transfers wiped (forced)');
  perform ok(cnt('interest_entries') = 0 and cnt('interest_disposals') = 0,
             'S3 interest wiped (forced)');
  perform ok(cnt('wallets') = 0 and cnt('wallet_transactions') = 0,
             'S3 wallets wiped (forced)');
  perform ok(cnt('transactions') = 5, 'S3 card/wallet/transfer rows gone (10→5)');
  perform ok((select count(*) from public.transactions
              where owner_id = '11111111-1111-1111-1111-111111111111'
                and source = 'opening' and bank_account_id is null) = 2,
             'S3 kept opening rows have card links nulled');
  perform ok(cnt('debts') = 1 and cnt('debt_payments') = 1, 'S3 debts kept');
  perform ok(cnt('people') = 1 and cnt('money_held_transactions') = 2,
             'S3 people/money-held kept');
  perform ok(cnt('categories') = 2 and cnt('budgets') = 1 and cnt('app_settings') = 1,
             'S3 categories/budgets/settings kept');
  perform ok((select count(*) from public.subscriptions
              where owner_id = '11111111-1111-1111-1111-111111111111'
                and payment_account_id is null) = 1,
             'S3 kept subscription card link nulled');
end $$;

-- ============================================================ S4 transactions only
select reseed();
select public.reset_user_data(array['transactions']);
do $$ begin
  perform ok(cnt('transactions') = 0, 'S4 whole ledger wiped');
  perform ok(cnt('debts') = 0 and cnt('debt_payments') = 0, 'S4 debts wiped (forced)');
  perform ok(cnt('transfers') = 0, 'S4 transfers wiped (forced)');
  perform ok(cnt('wallets') = 1, 'S4 wallet containers kept');
  perform ok((select balance from public.wallets
              where id = '20000000-0000-0000-0000-000000000001') = 0,
             'S4 kept wallet balance reverted to 0');
  perform ok(cnt('wallet_transactions') = 0, 'S4 wallet ledger wiped');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000001') = 0
             and (select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000002') = 0,
             'S4 kept card balances reverted to 0');
  perform ok(cnt('bank_accounts') = 2, 'S4 cards kept');
  perform ok(cnt('people') = 1 and cnt('money_held_transactions') = 2,
             'S4 people/money-held kept');
  perform ok(cnt('interest_entries') = 1, 'S4 interest kept');
  perform ok(cnt('subscriptions') = 1 and cnt('subscription_payments') = 1,
             'S4 subscriptions kept');
  perform ok(cnt('categories') = 2 and cnt('budgets') = 1 and cnt('app_settings') = 1
             and cnt('push_notification_log') = 1,
             'S4 categories/budgets/settings/log kept');
end $$;

-- ============================================================ S5 people only
select reseed();
select public.reset_user_data(array['people']);
do $$ begin
  perform ok(cnt('people') = 0, 'S5 people wiped');
  perform ok(cnt('debts') = 0 and cnt('debt_payments') = 0, 'S5 debts wiped (forced)');
  perform ok(cnt('money_held_people') = 0 and cnt('money_held_transactions') = 0,
             'S5 money held wiped (forced)');
  perform ok(cnt('transactions') = 10, 'S5 ledger untouched');
  perform ok((select balance from public.bank_accounts
              where id = '10000000-0000-0000-0000-000000000001') = 800
             and (select balance from public.wallets
              where id = '20000000-0000-0000-0000-000000000001') = 40,
             'S5 balances untouched');
  perform ok(cnt('transfers') = 1 and cnt('interest_entries') = 1
             and cnt('budgets') = 1 and cnt('categories') = 2,
             'S5 other groups untouched');
end $$;

-- ============================================================ S6 full wipe
select reseed();
select public.reset_user_data(array[
  'transactions','debts','cards','wallets','transfers','money_held',
  'subscriptions','interest','budgets','categories','people','app_settings'
]);
do $$ begin
  perform ok(cnt('transactions') = 0 and cnt('debts') = 0 and cnt('debt_payments') = 0
             and cnt('bank_accounts') = 0 and cnt('wallets') = 0
             and cnt('wallet_transactions') = 0 and cnt('transfers') = 0
             and cnt('money_held_people') = 0 and cnt('money_held_transactions') = 0
             and cnt('subscriptions') = 0 and cnt('subscription_payments') = 0
             and cnt('interest_entries') = 0 and cnt('interest_disposals') = 0
             and cnt('budgets') = 0 and cnt('categories') = 0 and cnt('people') = 0
             and cnt('app_settings') = 0 and cnt('push_notification_log') = 0,
             'S6 every u1 table is empty');
  perform ok((select count(*) from public.transactions
              where owner_id = '22222222-2222-2222-2222-222222222222') = 1
             and (select count(*) from public.bank_accounts
              where owner_id = '22222222-2222-2222-2222-222222222222') = 1
             and (select count(*) from public.categories
              where owner_id = '22222222-2222-2222-2222-222222222222') = 1,
             'S6 other user data fully isolated');
end $$;

-- ============================================================ S7 guard rails
select reseed();
do $$
begin
  -- unknown group
  begin
    perform public.reset_user_data(array['bogus']);
    raise exception 'FAIL: unknown group accepted';
  exception when others then
    if sqlerrm not like '%Unknown data group%' then raise; end if;
    perform ok(true, 'S7 unknown group rejected');
  end;

  -- empty selection
  begin
    perform public.reset_user_data(array[]::text[]);
    raise exception 'FAIL: empty selection accepted';
  exception when others then
    if sqlerrm not like '%No data groups selected%' then raise; end if;
    perform ok(true, 'S7 empty selection rejected');
  end;
end $$;

-- anonymous uid
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  begin
    perform public.reset_user_data(array['categories']);
    raise exception 'FAIL: signed-out call accepted';
  exception when others then
    if sqlerrm not like '%Not signed in%' then raise; end if;
    perform ok(true, 'S7 signed-out call rejected');
  end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- ============================================================ S8 closure report
select reseed();
do $$
declare
  result jsonb;
begin
  result := public.reset_user_data(array['cards']);
  perform ok(result->'tables' ? 'wallets' and result->'tables' ? 'transfers'
             and result->'tables' ? 'interest' and result->'tables' ? 'cards',
             'S8 closure reports forced groups in the RPC result');
  perform ok((result->'deleted'->>'bank_accounts')::int = 2,
             'S8 RPC reports deleted row counts');
end $$;

-- ============================================================ S9 permissions
select reseed();
set role authenticated;
select public.reset_user_data(array['budgets']);
reset role;
do $$ begin
  perform ok(cnt('budgets') = 0, 'S9 authenticated role can wipe (grant works)');
end $$;

set role anon;
do $$
begin
  begin
    perform public.reset_user_data(array['categories']);
    raise exception 'FAIL: anon can wipe';
  exception when others then
    if sqlerrm not like '%permission denied%' then raise; end if;
    perform ok(true, 'S9 anon blocked (revoke works)');
  end;
end $$;
reset role;

reset role;
\echo '=== ALL SCENARIOS PASSED ==='
