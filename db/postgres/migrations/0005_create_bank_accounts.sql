-- =============================================================================
-- Migration 0005: Create bank_accounts table
-- =============================================================================

-- UP
create table if not exists public.bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  bank_name             text not null,
  account_name          text not null,
  card_type             text not null,
  payment_network       text not null,
  card_number_masked    text not null,
  expiry_date           text not null,
  cardholder_name       text not null,
  account_number_masked text,
  ifsc_code             text,
  balance               numeric(14,2) not null default 0,
  credit_limit          numeric(14,2),
  theme                 text not null default 'blue',
  is_primary            boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists bank_accounts_owner_created_idx
  on public.bank_accounts (owner_id, created_at desc);

-- DOWN
-- drop table if exists public.bank_accounts cascade;
