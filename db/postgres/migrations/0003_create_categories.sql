-- =============================================================================
-- Migration 0003: Create categories table
-- =============================================================================

-- UP
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('income','expense','savings')),
  created_at  timestamptz not null default now(),
  unique (owner_id, name, kind)
);

create index if not exists categories_owner_idx on public.categories (owner_id);

-- DOWN
-- drop table if exists public.categories cascade;
