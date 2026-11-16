-- =============================================================================
-- Migration 0019: Cleanup unused columns and tables
--
-- Removes legacy interest disposal columns (recipient, purpose) that the app
-- no longer collects, and the separated_on column from interest_entries that
-- was never written. Drops the events family of tables (events,
-- event_participants, event_expenses, event_expense_participants,
-- event_settlements) which have no corresponding feature/UI.
-- Also removes 'event' from the transactions source check constraint.
-- =============================================================================

-- --- interest_disposals: drop legacy recipient/purpose columns ---------------

alter table public.interest_disposals
  drop column if exists recipient,
  drop column if exists purpose;

-- --- interest_entries: drop separated_on column ------------------------------

alter table public.interest_entries
  drop column if exists separated_on;

-- --- events family: drop tables with no feature/UI ---------------------------

drop table if exists public.event_settlements cascade;
drop table if exists public.event_expense_participants cascade;
drop table if exists public.event_expenses cascade;
drop table if exists public.event_participants cascade;
drop table if exists public.events cascade;

-- --- transactions: remove 'event' source -------------------------------------

-- Reclassify any existing event-sourced transactions as manual (no events UI
-- exists, so these rows can't be traced to an event anyway).
update public.transactions
set source = 'manual'
where source = 'event';

alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'debt', 'opening', 'transfer',
                      'wallet_recharge', 'wallet_spend', 'subscription'));
