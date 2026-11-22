-- =============================================================================
-- Migration 0007: Create transactions table
-- =============================================================================
-- Dependencies: users, categories, bank_accounts, wallets
-- =============================================================================

-- UP
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users(id) on delete cascade,
  occurred_on    date not null,
  amount         numeric(14,2) not null check (amount > 0),
  direction      text not null check (direction in ('in','out')),
  category_id    uuid references public.categories(id) on delete set null,
  notes          text,
  source         text not null default 'manual'
                 check (source in ('manual','debt','opening','transfer','wallet_recharge','wallet_spend','subscription')),
  source_ref_id  uuid,
  payment_mode   text not null default 'cash'
                 check (payment_mode in ('cash', 'bank')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  wallet_id      uuid references public.wallets(id) on delete restrict,
  created_at     timestamptz not null default now()
);

create index if not exists transactions_owner_date_idx
  on public.transactions (owner_id, occurred_on desc);

create index if not exists transactions_wallet_ref_idx
  on public.transactions (owner_id, wallet_id, occurred_on desc)
  where wallet_id is not null;

create unique index if not exists transactions_wallet_source_ref_direction_unique
  on public.transactions (owner_id, source, source_ref_id, direction)
  where source in ('wallet_recharge', 'wallet_spend') and source_ref_id is not null;

create index if not exists transactions_bank_account_idx
  on public.transactions (bank_account_id)
  where bank_account_id is not null;

create index if not exists transactions_transfer_ref_idx
  on public.transactions (owner_id, source_ref_id)
  where source = 'transfer';

-- DOWN
-- drop table if exists public.transactions cascade;
