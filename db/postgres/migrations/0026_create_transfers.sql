-- =============================================================================
-- Migration 0026: Create transfers table
-- =============================================================================
-- Dependencies: users, bank_accounts, transactions
--
-- A transfer is one history row plus two linked ledger rows (debit = money
-- leaving the source account, credit = money entering the destination).
-- Balances and ledger rows are written together inside a NestJS transaction
-- (TransfersService), so no RPC is involved.
-- =============================================================================

-- UP
create table if not exists public.transfers (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.users(id) on delete cascade,
  source_account_id      uuid not null references public.bank_accounts(id) on delete restrict,
  destination_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  amount                 numeric(14,2) not null check (amount > 0),
  occurred_on            date not null default current_date,
  notes                  text,
  debit_transaction_id   uuid references public.transactions(id) on delete set null,
  credit_transaction_id  uuid references public.transactions(id) on delete set null,
  created_at             timestamptz not null default now(),
  constraint transfers_different_accounts_check
    check (source_account_id <> destination_account_id)
);

create index if not exists transfers_owner_date_idx
  on public.transfers (owner_id, occurred_on desc, created_at desc);

create index if not exists transactions_transfer_ref_idx
  on public.transactions (owner_id, source_ref_id)
  where source = 'transfer';

-- DOWN
-- drop table if exists public.transfers cascade;
