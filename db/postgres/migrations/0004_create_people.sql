-- =============================================================================
-- Migration 0004: Create people table
-- =============================================================================

-- UP
create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  name        text not null,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists people_owner_idx on public.people (owner_id);

-- DOWN
-- drop table if exists public.people cascade;
