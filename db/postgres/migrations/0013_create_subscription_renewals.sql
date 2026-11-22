-- =============================================================================
-- Migration 0013: Create subscription_renewals table
-- =============================================================================
-- Dependencies: users, subscriptions
-- =============================================================================

-- UP
create table if not exists public.subscription_renewals (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  due_on           date not null,
  renewed_on       date not null,
  amount           numeric(14,2) not null check (amount > 0),
  status           text not null default 'completed' check (status in ('completed', 'skipped')),
  notes            text,
  created_at       timestamptz not null default now()
);

create unique index if not exists subscription_renewals_once_per_due_date
  on public.subscription_renewals (subscription_id, due_on);

create index if not exists subscription_renewals_history_idx
  on public.subscription_renewals (subscription_id, renewed_on desc, created_at desc);

-- DOWN
-- drop table if exists public.subscription_renewals cascade;
