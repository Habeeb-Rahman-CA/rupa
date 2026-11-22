-- =============================================================================
-- Migration 0022: Create push_preferences table
-- =============================================================================
-- Dependencies: users
-- =============================================================================

-- UP
create table if not exists public.push_preferences (
  owner_id    uuid not null references public.users(id) on delete cascade,
  category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, category)
);

-- DOWN
-- drop table if exists public.push_preferences cascade;
