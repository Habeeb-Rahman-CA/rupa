-- =============================================================================
-- Migration 0019: Create interest_entries table
-- =============================================================================
-- Dependencies: users, bank_accounts
-- =============================================================================

-- UP
create table if not exists public.interest_entries (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  bank_account_id   uuid not null references public.bank_accounts(id) on delete restrict,
  occurred_on       date not null default current_date,
  amount            numeric(14,2) not null check (amount > 0),
  stage             text not null default 'received'
                    check (stage in ('received', 'separated', 'disposed')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists interest_entries_unique_credit_idx
  on public.interest_entries (owner_id, occurred_on, bank_account_id, amount);

create index if not exists interest_entries_owner_date_idx
  on public.interest_entries (owner_id, occurred_on desc, created_at desc);

-- DOWN
-- drop table if exists public.interest_entries cascade;
