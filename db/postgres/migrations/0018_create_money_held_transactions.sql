-- =============================================================================
-- Migration 0018: Create money_held_transactions table
-- =============================================================================
-- Dependencies: users, money_held_people, bank_accounts
-- =============================================================================

-- UP
create table if not exists public.money_held_transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users(id) on delete cascade,
  held_person_id uuid not null references public.money_held_people(id) on delete restrict,
  direction      text not null check (direction in ('received', 'returned')),
  amount         numeric(14,2) not null check (amount > 0),
  occurred_on    date not null default current_date,
  payment_mode   text not null default 'cash' check (payment_mode in ('cash', 'bank')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists money_held_transactions_person_date_idx
  on public.money_held_transactions (held_person_id, occurred_on desc, created_at desc);

-- DOWN
-- drop table if exists public.money_held_transactions cascade;
