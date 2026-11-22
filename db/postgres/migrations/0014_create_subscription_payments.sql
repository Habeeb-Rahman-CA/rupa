-- =============================================================================
-- Migration 0014: Create subscription_payments table
-- =============================================================================
-- Dependencies: users, subscriptions, subscription_renewals, transactions
-- =============================================================================

-- UP
create table if not exists public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  renewal_id       uuid not null references public.subscription_renewals(id) on delete cascade,
  amount           numeric(14,2) not null check (amount > 0),
  paid_on          date not null,
  transaction_id   uuid unique references public.transactions(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists subscription_payments_history_idx
  on public.subscription_payments (subscription_id, paid_on desc, created_at desc);

-- DOWN
-- drop table if exists public.subscription_payments cascade;
