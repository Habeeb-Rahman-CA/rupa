-- =============================================================================
-- Migration 0021: Create push_subscriptions table
-- =============================================================================
-- Dependencies: users
-- =============================================================================

-- UP
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists push_subscriptions_owner_endpoint_idx
  on public.push_subscriptions (owner_id, endpoint);

create index if not exists push_subscriptions_owner_idx
  on public.push_subscriptions (owner_id);

-- DOWN
-- drop table if exists public.push_subscriptions cascade;
