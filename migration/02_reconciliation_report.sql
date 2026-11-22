-- =============================================================================
# Reconciliation Report: Supabase vs NestJS PostgreSQL
#
# PURPOSE:
#   Generate side-by-side comparison reports between the source Supabase
#   database and the target NestJS PostgreSQL database after data migration.
#
# USAGE:
#   Run each query block on BOTH databases. Compare the outputs manually or
#   via a diff tool. Any mismatch indicates missing, duplicate, or
#   inconsistent records.
#
-- =============================================================================


-- ---------------------------------------------------------------------------
-- REPORT 1: Overall record counts per table
-- ---------------------------------------------------------------------------
-- Run on both databases, compare counts table by table.

SELECT 'users'              as table_name, count(*) as record_count FROM public.users
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


-- ---------------------------------------------------------------------------
-- REPORT 2: Per-user record counts (ownership isolation check)
-- ---------------------------------------------------------------------------
-- Every row must have an owner_id matching a known user. No orphaned rows.

SELECT 'categories' as table_name, owner_id, count(*) as cnt
FROM public.categories GROUP BY owner_id
UNION ALL
SELECT 'people', owner_id, count(*) FROM public.people GROUP BY owner_id
UNION ALL
SELECT 'bank_accounts', owner_id, count(*) FROM public.bank_accounts GROUP BY owner_id
UNION ALL
SELECT 'transactions', owner_id, count(*) FROM public.transactions GROUP BY owner_id
UNION ALL
SELECT 'debts', owner_id, count(*) FROM public.debts GROUP BY owner_id
UNION ALL SELECT 'debts', owner_id, count(*) FROM public.debts GROUP BY owner_id
UNION ALL SELECT 'wallets', owner_id, count(*) FROM public.wallets GROUP BY owner_id
UNION ALL SELECT 'subscriptions', owner_id, count(*) FROM public.subscriptions GROUP BY owner_id
UNION ALL SELECT 'push_subscriptions', owner_id, count(*) FROM public.push_subscriptions GROUP BY owner_id
UNION ALL SELECT 'money_held_people', owner_id, count(*) FROM public.money_held_people GROUP BY owner_id
ORDER BY table_name, owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 3: Per-user transaction totals (income/expense/savings)
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as total_transactions,
  sum(case when direction = 'in' then amount else 0 end) as total_income,
  sum(case when direction = 'out' then amount else 0 end) as total_expense,
  sum(case when source = 'transfer' then amount else 0 end) as total_transfers,
  sum(case when source = 'wallet_spend' then amount else 0 end) as total_wallet_spend,
  sum(case when source = 'wallet_recharge' then amount else 0 end) as total_wallet_recharge
FROM public.transactions
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 4: Bank account balances per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as account_count,
  sum(balance) as total_bank_balance,
  sum(credit_limit) as total_credit_limit
FROM public.bank_accounts
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 5: Wallet balances per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as wallet_count,
  sum(balance) as total_wallet_balance,
  sum(initial_balance) as total_initial_balance,
  sum(minimum_balance) as total_minimum_balance
FROM public.wallets
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 6: Debts per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as debt_count,
  sum(principal) as total_principal,
  sum(outstanding) as total_outstanding,
  sum(case when direction = 'they_owe' then outstanding else 0 end) as they_owe_you,
  sum(case when direction = 'i_owe' then outstanding else 0 end) as you_owe_them
FROM public.debts
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 7: Transfers per user (source='transfer' transactions)
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as transfer_count,
  sum(amount) as total_transfer_amount
FROM public.transactions
WHERE source = 'transfer'
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 8: Subscription records per user
-- ---------------------------------------------------------------------------
SELECT
  s.owner_id,
  count(*) as subscription_count,
  sum(s.amount) as total_subscription_amount,
  sum(case when s.status = 'active' then 1 else 0 end) as active_subscriptions,
  sum(case when s.status = 'cancelled' then 1 else 0 end) as cancelled_subscriptions,
  sum(case when s.status = 'paused' then 1 else 0 end) as paused_subscriptions,
  sum(case when s.status = 'expired' then 1 else 0 end) as expired_subscriptions
FROM public.subscriptions s
GROUP BY s.owner_id
ORDER BY s.owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 9: Budget records per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as budget_count,
  sum(amount) as total_budget_amount,
  sum(case when recurring then 1 else 0 end) as recurring_budgets
FROM public.budgets
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 10: Interest tracker records per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as interest_entry_count,
  sum(amount) as total_interest_recorded,
  sum(case when stage = 'received' then amount else 0 end) as interest_received,
  sum(case when stage = 'separated' then amount else 0 end) as interest_separated,
  sum(case when stage = 'disposed' then amount else 0 end) as interest_disposed
FROM public.interest_entries
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 11: Interest disposals per user
-- ---------------------------------------------------------------------------
SELECT
  owner_id,
  count(*) as disposal_count,
  sum(amount) as total_disposed_amount
FROM public.interest_disposals
GROUP BY owner_id
ORDER BY owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 12: Event and settlement records per user
-- ---------------------------------------------------------------------------
SELECT
  e.owner_id,
  count(distinct e.id) as event_count,
  count(distinct ep.id) as participant_count,
  count(distinct ee.id) as expense_count,
  count(distinct es.id) as settlement_count
FROM public.events e
LEFT JOIN public.event_participants ep ON ep.event_id = e.id
LEFT JOIN public.event_expenses ee ON ee.event_id = e.id
LEFT JOIN public.event_settlements es ON es.event_id = e.id
GROUP BY e.owner_id
ORDER BY e.owner_id;


-- ---------------------------------------------------------------------------
-- REPORT 13: Duplicate detection (rows with identical key fields)
-- ---------------------------------------------------------------------------
-- Duplicate transactions (same owner, occurred_on, amount, direction, category)
SELECT
  owner_id, occurred_on, amount, direction, category_id, count(*) as dup_count
FROM public.transactions
GROUP BY owner_id, occurred_on, amount, direction, category_id
HAVING count(*) > 1
ORDER BY dup_count DESC;

-- Duplicate push subscriptions (same owner, endpoint)
SELECT
  owner_id, endpoint, count(*) as dup_count
FROM public.push_subscriptions
GROUP BY owner_id, endpoint
HAVING count(*) > 1
ORDER BY dup_count DESC;

-- Duplicate subscription renewals (same subscription, due_on)
SELECT
  subscription_id, due_on, count(*) as dup_count
FROM public.subscription_renewals
GROUP BY subscription_id, due_on
HAVING count(*) > 1
ORDER BY dup_count DESC;

-- Duplicate push notification log entries (same owner, category, ref)
SELECT
  owner_id, category, ref, count(*) as dup_count
FROM public.push_notification_log
GROUP BY owner_id, category, ref
HAVING count(*) > 1
ORDER BY dup_count DESC;


-- ---------------------------------------------------------------------------
-- REPORT 14: Orphaned rows (foreign key violations / missing parents)
-- ---------------------------------------------------------------------------
-- Transactions referencing non-existent categories
SELECT t.id as orphan_tx_id, t.owner_id, t.category_id
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.category_id IS NOT NULL AND c.id IS NULL;

-- Debts referencing non-existent people
SELECT d.id as orphan_debt_id, d.owner_id, d.person_id
FROM public.debts d
LEFT JOIN public.people p ON p.id = d.person_id
WHERE p.id IS NULL;

-- Wallet transactions referencing non-existent wallets
SELECT wt.id as orphan_wt_id, wt.owner_id, wt.wallet_id
FROM public.wallet_transactions wt
LEFT JOIN public.wallets w ON w.id = wt.wallet_id
WHERE w.id IS NULL;

-- Subscription payments referencing non-existent subscriptions
SELECT sp.id as orphan_sp_id, sp.owner_id, sp.subscription_id
FROM public.subscription_payments sp
LEFT JOIN public.subscriptions s ON s.id = sp.subscription_id
WHERE s.id IS NULL;

-- Interest entries referencing non-existent bank accounts
SELECT ie.id as orphan_ie_id, ie.owner_id, ie.bank_account_id
FROM public.interest_entries ie
LEFT JOIN public.bank_accounts ba ON ba.id = ie.bank_account_id
WHERE ba.id IS NULL;

-- Money held people referencing non-existent people
SELECT mhp.id as orphan_mhp_id, mhp.owner_id, mhp.person_id
FROM public.money_held_people mhp
LEFT JOIN public.people p ON p.id = mhp.person_id
WHERE p.id IS NULL;

-- Push subscriptions referencing non-existent users
SELECT ps.id as orphan_ps_id, ps.owner_id
FROM public.push_subscriptions ps
LEFT JOIN public.users u ON u.id = ps.owner_id
WHERE u.id IS NULL;


-- ---------------------------------------------------------------------------
-- REPORT 15: Timestamp preservation spot check
-- ---------------------------------------------------------------------------
-- Compare min/max created_at across key tables (should match source)
SELECT
  'transactions' as table_name,
  min(created_at) as earliest_created_at,
  max(created_at) as latest_created_at,
  count(*) as row_count
FROM public.transactions
UNION ALL
SELECT 'bank_accounts', min(created_at), max(created_at), count(*) FROM public.bank_accounts
UNION ALL
SELECT 'wallets', min(created_at), max(created_at), count(*) FROM public.wallets
UNION ALL
SELECT 'subscriptions', min(created_at), max(created_at), count(*) FROM public.subscriptions
UNION ALL
SELECT 'debts', min(created_at), max(created_at), count(*) FROM public.debts
ORDER BY table_name;


-- ---------------------------------------------------------------------------
-- REPORT 16: Financial amount spot checks (precision verification)
-- ---------------------------------------------------------------------------
-- Verify numeric amounts are preserved exactly (no rounding drift)
SELECT
  owner_id,
  count(*) as tx_count,
  sum(amount)::numeric(14,2) as total_amount
FROM public.transactions
GROUP BY owner_id
ORDER BY owner_id;

SELECT
  owner_id,
  count(*) as wallet_count,
  sum(balance)::numeric(14,2) as total_wallet_balance
FROM public.wallets
GROUP BY owner_id
ORDER BY owner_id;

SELECT
  owner_id,
  count(*) as debt_count,
  sum(outstanding)::numeric(14,2) as total_debt_outstanding
FROM public.debts
GROUP BY owner_id
ORDER BY owner_id;
