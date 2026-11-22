-- =============================================================================
-- Migration 0006: Create wallets table
-- =============================================================================

-- UP
create table if not exists public.wallets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users(id) on delete cascade,
  name             text not null check (char_length(trim(name)) > 0),
  initial_balance  numeric(14,2) not null default 0 check (initial_balance >= 0),
  balance          numeric(14,2) not null default 0 check (balance >= 0),
  minimum_balance  numeric(14,2) not null default 0 check (minimum_balance >= 0),
  theme            text not null default 'dark' check (theme in ('blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose')),
  created_at       timestamptz not null default now()
);

create index if not exists wallets_owner_created_idx
  on public.wallets (owner_id, created_at desc);

-- DOWN
-- drop table if exists public.wallets cascade;
