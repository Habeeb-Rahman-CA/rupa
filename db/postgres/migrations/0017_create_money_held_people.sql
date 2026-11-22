-- =============================================================================
-- Migration 0017: Create money_held_people table
-- =============================================================================
-- Dependencies: users, people
-- =============================================================================

-- UP
create table if not exists public.money_held_people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.users(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (owner_id, person_id)
);

create index if not exists money_held_people_owner_idx
  on public.money_held_people (owner_id, created_at desc);

-- DOWN
-- drop table if exists public.money_held_people cascade;
