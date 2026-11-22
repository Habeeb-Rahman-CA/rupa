-- =============================================================================
-- Migration 0011: Create subscriptions table
-- =============================================================================
-- Dependencies: users, bank_accounts
-- =============================================================================

-- UP
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.users(id) on delete cascade,
  name                text not null check (char_length(trim(name)) > 0),
  category            text not null default 'Other',
  amount              numeric(14,2) not null check (amount > 0),
  billing_cycle       text not null check (billing_cycle in ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date          date not null,
  next_renewal_date   date not null,
  end_date            date,
  payment_account_id  uuid references public.bank_accounts(id) on delete set null,
  auto_renewal        boolean not null default true,
  status              text not null default 'active'
                      check (status in ('active', 'paused', 'cancelled', 'expired')),
  theme               text not null default 'slate'
                      check (theme in ('slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet')),
  cancelled_on        date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint subscriptions_dates_check check (end_date is null or end_date >= start_date)
);

create index if not exists subscriptions_owner_renewal_idx
  on public.subscriptions (owner_id, next_renewal_date);

create index if not exists subscriptions_owner_status_idx
  on public.subscriptions (owner_id, status);

-- DOWN
-- drop table if exists public.subscriptions cascade;
