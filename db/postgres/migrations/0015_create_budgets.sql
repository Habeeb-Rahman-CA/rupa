-- =============================================================================
-- Migration 0015: Create budgets table
-- =============================================================================
-- Dependencies: users, categories
-- =============================================================================

-- UP
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  name         text not null,
  category_id  uuid references public.categories(id) on delete set null,
  amount       numeric(14,2) not null check (amount > 0),
  period       text not null default 'monthly'
                 check (period in ('weekly', 'monthly', 'yearly', 'custom')),
  start_date   date not null,
  end_date     date not null,
  recurring    boolean not null default false,
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

-- DOWN
-- drop table if exists public.budgets cascade;
