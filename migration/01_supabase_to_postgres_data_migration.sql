-- =============================================================================
-- Supabase → PostgreSQL (NestJS) Data Migration Script
--
-- PURPOSE:
--   Repeatable, idempotent migration of all Rupa data from Supabase tables
--   into the NestJS/TypeORM PostgreSQL database.
--
-- PREREQUISITES:
--   1. Source Supabase data has been restored into this database (or tables
--      already exist with Supabase schema).
--   2. Target NestJS schema has been applied (migration/03_nestjs_schema.sql).
--   3. Run this script against the TARGET database.
--
-- PASSWORD HANDLING:
--   Supabase password hashes are NOT compatible with NestJS bcrypt hashes.
--   All migrated users must reset their password on first login.
--
-- USAGE:
--   PGPASSWORD=<password> psql -h <host> -p <port> -U <user> -d <db> \\
--     -f migration/01_supabase_to_postgres_data_migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 0: Users (auth.users → users table)
-- ---------------------------------------------------------------------------
-- Supabase auth.users → NestJS users table.
-- Passwords are NOT migrated. All users must reset their password on first login.
-- Users table uses camelCase column names (passwordHash, createdAt, updatedAt).
-- Only runs if auth.users table exists (i.e., Supabase auth data was restored).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO public.users (id, email, "passwordHash", createdAt, updatedAt)
    SELECT
      au.id,
      au.email,
      'migrated-from-supabase-reset-required',
      au.created_at,
      au.updated_at
    FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 1: Categories
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (id, owner_id, name, kind, created_at)
SELECT
  c.id,
  c.owner_id,
  c.name,
  c.kind,
  c.created_at
FROM public.categories c
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 2: People
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, owner_id, name, phone, notes, created_at)
SELECT
  p.id,
  p.owner_id,
  p.name,
  p.phone,
  p.notes,
  p.created_at
FROM public.people p
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 3: Bank Accounts
-- ---------------------------------------------------------------------------
-- Supabase bank_accounts has theme column; NestJS bank_accounts also has theme
INSERT INTO public.bank_accounts (
  id, owner_id, bank_name, account_name, card_type, payment_network,
  card_number_masked, expiry_date, cardholder_name, account_number_masked,
  ifsc_code, balance, credit_limit, theme, is_primary, created_at
)
SELECT
  ba.id,
  ba.owner_id,
  ba.bank_name,
  ba.account_name,
  ba.card_type,
  ba.payment_network,
  ba.card_number_masked,
  ba.expiry_date,
  ba.cardholder_name,
  ba.account_number_masked,
  ba.ifsc_code,
  ba.balance,
  ba.credit_limit,
  ba.theme,
  ba.is_primary,
  ba.created_at
FROM public.bank_accounts ba
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 4: Transactions
-- ---------------------------------------------------------------------------
INSERT INTO public.transactions (
  id, owner_id, occurred_on, amount, direction, category_id, notes,
  source, source_ref_id, payment_mode, bank_account_id, wallet_id, created_at
)
SELECT
  t.id,
  t.owner_id,
  t.occurred_on,
  t.amount,
  t.direction,
  t.category_id,
  t.notes,
  t.source,
  t.source_ref_id,
  t.payment_mode,
  t.bank_account_id,
  t.wallet_id,
  t.created_at
FROM public.transactions t
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 5: Debts
-- ---------------------------------------------------------------------------
INSERT INTO public.debts (
  id, owner_id, person_id, direction, principal, outstanding,
  reason, opened_on, closed_on, created_at
)
SELECT
  d.id,
  d.owner_id,
  d.person_id,
  d.direction,
  d.principal,
  d.outstanding,
  d.reason,
  d.opened_on,
  d.closed_on,
  d.created_at
FROM public.debts d
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 6: Debt Payments
-- ---------------------------------------------------------------------------
INSERT INTO public.debt_payments (
  id, debt_id, amount, paid_on, transaction_id, notes
)
SELECT
  dp.id,
  dp.debt_id,
  dp.amount,
  dp.paid_on,
  dp.transaction_id,
  dp.notes
FROM public.debt_payments dp
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 7: Events
-- ---------------------------------------------------------------------------
INSERT INTO public.events (
  id, owner_id, name, kind, starts_on, ends_on, notes, status, created_at
)
SELECT
  e.id,
  e.owner_id,
  e.name,
  e.kind,
  e.starts_on,
  e.ends_on,
  e.notes,
  e.status,
  e.created_at
FROM public.events e
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 8: Event Participants
-- ---------------------------------------------------------------------------
INSERT INTO public.event_participants (
  id, event_id, person_id, is_you
)
SELECT
  ep.id,
  ep.event_id,
  ep.person_id,
  ep.is_you
FROM public.event_participants ep
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 9: Event Expenses
-- ---------------------------------------------------------------------------
INSERT INTO public.event_expenses (
  id, event_id, description, amount, paid_on, transaction_id
)
SELECT
  ee.id,
  ee.event_id,
  ee.description,
  ee.amount,
  ee.paid_on,
  ee.transaction_id
FROM public.event_expenses ee
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 10: Event Expense Participants
-- ---------------------------------------------------------------------------
INSERT INTO public.event_expense_participants (
  id, event_expense_id, event_participant_id
)
SELECT
  eep.id,
  eep.event_expense_id,
  eep.event_participant_id
FROM public.event_expense_participants eep
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 11: Event Settlements
-- ---------------------------------------------------------------------------
INSERT INTO public.event_settlements (
  id, event_id, event_participant_id, paid_on, transaction_id
)
SELECT
  es.id,
  es.event_id,
  es.event_participant_id,
  es.paid_on,
  es.transaction_id
FROM public.event_settlements es
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 12: Wallets
-- ---------------------------------------------------------------------------
-- NOTE: Supabase wallets table has 'kind' column but NO 'theme' column.
-- NestJS wallets table has theme but not kind. We insert without theme
-- (will use DB default) and skip kind since NestJS doesn't have that column.
INSERT INTO public.wallets (
  id, owner_id, name, initial_balance, balance, minimum_balance, created_at
)
SELECT
  w.id,
  w.owner_id,
  w.name,
  w.initial_balance,
  w.balance,
  w.minimum_balance,
  w.created_at
FROM public.wallets w
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 13: Wallet Transactions
-- ---------------------------------------------------------------------------
INSERT INTO public.wallet_transactions (
  id, owner_id, wallet_id, kind, amount, occurred_on, category_id,
  funding_mode, bank_account_id, notes, debit_transaction_id,
  credit_transaction_id, created_at
)
SELECT
  wt.id,
  wt.owner_id,
  wt.wallet_id,
  wt.kind,
  wt.amount,
  wt.occurred_on,
  wt.category_id,
  wt.funding_mode,
  wt.bank_account_id,
  wt.notes,
  wt.debit_transaction_id,
  wt.credit_transaction_id,
  wt.created_at
FROM public.wallet_transactions wt
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 14: Subscriptions
-- ---------------------------------------------------------------------------
INSERT INTO public.subscriptions (
  id, owner_id, name, category, amount, billing_cycle, start_date,
  next_renewal_date, end_date, payment_account_id, auto_renewal, status,
  theme, cancelled_on, notes, created_at, updated_at
)
SELECT
  s.id,
  s.owner_id,
  s.name,
  s.category,
  s.amount,
  s.billing_cycle,
  s.start_date,
  s.next_renewal_date,
  s.end_date,
  s.payment_account_id,
  s.auto_renewal,
  s.status,
  s.theme,
  s.cancelled_on,
  s.notes,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 15: Subscription Price Changes
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_price_changes (
  id, owner_id, subscription_id, old_amount, new_amount, effective_on, notes, created_at
)
SELECT
  spc.id,
  spc.owner_id,
  spc.subscription_id,
  spc.old_amount,
  spc.new_amount,
  spc.effective_on,
  spc.notes,
  spc.created_at
FROM public.subscription_price_changes spc
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 16: Subscription Renewals
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_renewals (
  id, owner_id, subscription_id, due_on, renewed_on, amount, status, notes, created_at
)
SELECT
  sr.id,
  sr.owner_id,
  sr.subscription_id,
  sr.due_on,
  sr.renewed_on,
  sr.amount,
  sr.status,
  sr.notes,
  sr.created_at
FROM public.subscription_renewals sr
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 17: Subscription Payments
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_payments (
  id, owner_id, subscription_id, renewal_id, amount, paid_on,
  transaction_id, notes, created_at
)
SELECT
  sp.id,
  sp.owner_id,
  sp.subscription_id,
  sp.renewal_id,
  sp.amount,
  sp.paid_on,
  sp.transaction_id,
  sp.notes,
  sp.created_at
FROM public.subscription_payments sp
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 18: Interest Entries
-- ---------------------------------------------------------------------------
-- NOTE: Supabase interest_entries does NOT have 'separated_on' column.
-- NestJS table has it but Supabase doesn't, so we skip it.
INSERT INTO public.interest_entries (
  id, owner_id, bank_account_id, occurred_on, amount, stage,
  notes, created_at, updated_at
)
SELECT
  ie.id,
  ie.owner_id,
  ie.bank_account_id,
  ie.occurred_on,
  ie.amount,
  ie.stage,
  ie.notes,
  ie.created_at,
  ie.updated_at
FROM public.interest_entries ie
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 19: Interest Disposals
-- ---------------------------------------------------------------------------
-- NOTE: Supabase interest_disposals does NOT have 'recipient' or 'purpose'
-- columns. NestJS table requires them, so we set defaults.
INSERT INTO public.interest_disposals (
  id, owner_id, entry_id, occurred_on, amount, notes,
  created_at, updated_at
)
SELECT
  idp.id,
  idp.owner_id,
  idp.entry_id,
  idp.occurred_on,
  idp.amount,
  idp.notes,
  idp.created_at,
  idp.updated_at
FROM public.interest_disposals idp
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 20: Push Subscriptions
-- ---------------------------------------------------------------------------
INSERT INTO public.push_subscriptions (
  id, owner_id, endpoint, p256dh, auth, user_agent, created_at, updated_at
)
SELECT
  ps.id,
  ps.owner_id,
  ps.endpoint,
  ps.p256dh,
  ps.auth,
  ps.user_agent,
  ps.created_at,
  ps.updated_at
FROM public.push_subscriptions ps
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 21: Push Preferences
-- ---------------------------------------------------------------------------
INSERT INTO public.push_preferences (
  owner_id, category, enabled, updated_at
)
SELECT
  pp.owner_id,
  pp.category,
  pp.enabled,
  pp.updated_at
FROM public.push_preferences pp
ON CONFLICT (owner_id, category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 22: Push Notification Log
-- ---------------------------------------------------------------------------
INSERT INTO public.push_notification_log (
  id, owner_id, category, ref, created_at
)
SELECT
  pnl.id,
  pnl.owner_id,
  pnl.category,
  pnl.ref,
  pnl.created_at
FROM public.push_notification_log pnl
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 23: Money Held People
-- ---------------------------------------------------------------------------
INSERT INTO public.money_held_people (
  id, owner_id, person_id, created_at
)
SELECT
  mhp.id,
  mhp.owner_id,
  mhp.person_id,
  mhp.created_at
FROM public.money_held_people mhp
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 24: Money Held Transactions
-- ---------------------------------------------------------------------------
INSERT INTO public.money_held_transactions (
  id, owner_id, held_person_id, direction, amount, occurred_on,
  payment_mode, bank_account_id, notes, created_at
)
SELECT
  mht.id,
  mht.owner_id,
  mht.held_person_id,
  mht.direction,
  mht.amount,
  mht.occurred_on,
  mht.payment_mode,
  mht.bank_account_id,
  mht.notes,
  mht.created_at
FROM public.money_held_transactions mht
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 25: Post-Migration Summary
-- ---------------------------------------------------------------------------
SELECT 'users' as table_name, count(*) as record_count FROM public.users
UNION ALL SELECT 'categories', count(*) FROM public.categories
UNION ALL SELECT 'people', count(*) FROM public.people
UNION ALL SELECT 'bank_accounts', count(*) FROM public.bank_accounts
UNION ALL SELECT 'transactions', count(*) FROM public.transactions
UNION ALL SELECT 'debts', count(*) FROM public.debts
UNION ALL SELECT 'debt_payments', count(*) FROM public.debt_payments
UNION ALL SELECT 'events', count(*) FROM public.events
UNION ALL SELECT 'event_participants', count(*) FROM public.event_participants
UNION ALL SELECT 'event_expenses', count(*) FROM public.event_expenses
UNION ALL SELECT 'event_expense_participants', count(*) FROM public.event_expense_participants
UNION ALL SELECT 'event_settlements', count(*) FROM public.event_settlements
UNION ALL SELECT 'wallets', count(*) FROM public.wallets
UNION ALL SELECT 'wallet_transactions', count(*) FROM public.wallet_transactions
UNION ALL SELECT 'subscriptions', count(*) FROM public.subscriptions
UNION ALL SELECT 'subscription_price_changes', count(*) FROM public.subscription_price_changes
UNION ALL SELECT 'subscription_renewals', count(*) FROM public.subscription_renewals
UNION ALL SELECT 'subscription_payments', count(*) FROM public.subscription_payments
UNION ALL SELECT 'interest_entries', count(*) FROM public.interest_entries
UNION ALL SELECT 'interest_disposals', count(*) FROM public.interest_disposals
UNION ALL SELECT 'push_subscriptions', count(*) FROM public.push_subscriptions
UNION ALL SELECT 'push_preferences', count(*) FROM public.push_preferences
UNION ALL SELECT 'push_notification_log', count(*) FROM public.push_notification_log
UNION ALL SELECT 'money_held_people', count(*) FROM public.money_held_people
UNION ALL SELECT 'money_held_transactions', count(*) FROM public.money_held_transactions
ORDER BY table_name;
