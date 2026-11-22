-- =============================================================================
-- Migration 0023: Create push_notification_log table
-- =============================================================================
-- Dependencies: users
-- =============================================================================

-- UP
create table if not exists public.push_notification_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
  ref         text not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, category, ref)
);

create index if not exists push_notification_log_created_idx
  on public.push_notification_log (created_at);

-- DOWN
-- drop table if exists public.push_notification_log cascade;
