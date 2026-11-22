-- =============================================================================
-- Migration 0024: Create push_config table
-- =============================================================================
-- No foreign key dependencies.
-- =============================================================================

-- UP
create table if not exists public.push_config (
  name        text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- DOWN
-- drop table if exists public.push_config cascade;
