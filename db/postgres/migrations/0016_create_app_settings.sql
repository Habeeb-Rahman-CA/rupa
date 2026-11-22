-- =============================================================================
-- Migration 0016: Create app_settings table
-- =============================================================================
-- Dependencies: users
-- =============================================================================

-- UP
create table if not exists public.app_settings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references public.users(id) on delete cascade,
  ai_api_key        text,
  ai_base_url       text,
  ai_model          text,
  ai_headers        jsonb,
  updated_at        timestamptz not null default now()
);

-- DOWN
-- drop table if exists public.app_settings cascade;
