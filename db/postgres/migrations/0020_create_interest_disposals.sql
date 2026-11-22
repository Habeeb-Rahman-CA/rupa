-- =============================================================================
-- Migration 0020: Create interest_disposals table
-- =============================================================================
-- Dependencies: users, interest_entries
-- =============================================================================

-- UP
create table if not exists public.interest_disposals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  entry_id      uuid not null references public.interest_entries(id) on delete cascade,
  occurred_on   date not null default current_date,
  amount        numeric(14,2) not null check (amount > 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists interest_disposals_owner_date_idx
  on public.interest_disposals (owner_id, occurred_on desc, created_at desc);

create index if not exists interest_disposals_entry_idx
  on public.interest_disposals (entry_id);

-- DOWN
-- drop table if exists public.interest_disposals cascade;
