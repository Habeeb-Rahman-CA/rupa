-- =============================================================================
-- Migration 0002: Create users table (replaces Supabase auth.users)
-- =============================================================================

-- UP
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  password_hash text not null,
  created_at   timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

-- DOWN
-- drop table if exists public.users cascade;
