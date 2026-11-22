-- =============================================================================
-- Migration 0012: Create subscription_price_changes table
-- =============================================================================
-- Dependencies: users, subscriptions
-- =============================================================================

-- UP
create table if not exists public.subscription_price_changes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  old_amount       numeric(14,2) not null check (old_amount > 0),
  new_amount       numeric(14,2) not null check (new_amount > 0),
  effective_on     date not null default current_date,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists subscription_price_changes_history_idx
  on public.subscription_price_changes (subscription_id, effective_on desc, created_at desc);

-- DOWN
-- drop table if exists public.subscription_price_changes cascade;
