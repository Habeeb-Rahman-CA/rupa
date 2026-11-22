-- =============================================================================
-- Migration 0009: Create debts table
-- =============================================================================
-- Dependencies: users, people
-- =============================================================================

-- UP
create table if not exists public.debts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete restrict,
  direction    text not null check (direction in ('i_owe','they_owe')),
  principal    numeric(14,2) not null check (principal > 0),
  outstanding  numeric(14,2) not null check (outstanding >= 0),
  reason       text,
  opened_on    date not null default current_date,
  closed_on    date,
  created_at   timestamptz not null default now()
);

create index if not exists debts_owner_idx on public.debts (owner_id);

-- DOWN
-- drop table if exists public.debts cascade;
