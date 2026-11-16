-- =============================================================================
-- Migration 0018: Budgets (category spending limits)
--
-- Components:
--   * budgets — one row per budget period.
--       category_id set    → spending limit for that expense category.
--       category_id null   → overall spending limit (all actual expenses).
--       start_date/end_date are local date-only values (the period bounds).
--       recurring          → the app rolls the row forward into the next
--                            period after end_date (a new row is inserted;
--                            the old one stays as history).
--       thresholds         → push-notification milestones as percentages of
--                            the limit (subset of 50/75/90/100). Empty array
--                            = no alerts for this budget.
--
-- Sending happens in the existing Edge Function supabase/functions/
-- push-notifications (scheduled mode): it reads budgets + transactions with
-- the service role, applies the same accounting rules as the app and fires
-- each threshold exactly once via push_notification_log de-duplication.
--
-- This migration also widens the push category check constraints so the
-- 'budget' category can be stored in push_preferences / push_notification_log.
-- =============================================================================

-- --------------------------------- budgets ----------------------------------

create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  -- null → overall budget; otherwise the expense category it limits.
  category_id  uuid references public.categories(id) on delete set null,
  amount       numeric(14,2) not null check (amount > 0),
  period       text not null default 'monthly'
                 check (period in ('weekly', 'monthly', 'yearly', 'custom')),
  start_date   date not null,
  end_date     date not null,
  recurring    boolean not null default false,
  -- Notification milestones (percent of amount); only the four known
  -- milestones may be stored. Empty array = alerts disabled for this budget.
  thresholds   integer[] not null default '{50,75,90,100}'
                 check (thresholds <@ array[50,75,90,100]),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budgets_valid_range check (end_date >= start_date)
);

create index if not exists budgets_owner_start_idx
  on public.budgets (owner_id, start_date desc);

create index if not exists budgets_owner_category_idx
  on public.budgets (owner_id, category_id);

-- ----------------------------- Row level security ---------------------------

alter table public.budgets enable row level security;

drop policy if exists budgets_owner_all on public.budgets;
create policy budgets_owner_all on public.budgets
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- --------------------- widen push category constraints ----------------------
-- The constraints were created inline by migration 0017 (auto-named
-- <table>_<column>_check). Replace them so 'budget' is allowed everywhere a
-- push category can be written — preferences (client) and send log (backend).

alter table public.push_preferences
  drop constraint if exists push_preferences_category_check;
alter table public.push_preferences
  add constraint push_preferences_category_check
  check (category in ('renewals', 'low_balance', 'budget'));

alter table public.push_notification_log
  drop constraint if exists push_notification_log_category_check;
alter table public.push_notification_log
  add constraint push_notification_log_category_check
  check (category in ('renewals', 'low_balance', 'budget'));
