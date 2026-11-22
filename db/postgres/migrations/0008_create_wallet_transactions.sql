-- =============================================================================
-- Migration 0008: Create wallet_transactions table
-- =============================================================================
-- Dependencies: users, wallets, categories, bank_accounts, transactions
-- =============================================================================

-- UP
create table if not exists public.wallet_transactions (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  wallet_id             uuid not null references public.wallets(id) on delete cascade,
  kind                  text not null check (kind in ('recharge', 'spend')),
  amount                numeric(14,2) not null check (amount > 0),
  occurred_on           date not null default current_date,
  category_id           uuid references public.categories(id) on delete set null,
  funding_mode          text check (funding_mode in ('cash', 'bank')),
  bank_account_id       uuid references public.bank_accounts(id) on delete restrict,
  notes                 text,
  debit_transaction_id  uuid not null unique references public.transactions(id) on delete restrict,
  credit_transaction_id uuid unique references public.transactions(id) on delete restrict,
  created_at            timestamptz not null default now(),
  constraint wallet_transaction_kind_fields_check check (
    (
      kind = 'recharge'
      and category_id is null
      and funding_mode is not null
      and (
        (funding_mode = 'cash' and bank_account_id is null)
        or (funding_mode = 'bank' and bank_account_id is not null)
      )
      and credit_transaction_id is not null
    )
    or (
      kind = 'spend'
      and funding_mode is null
      and bank_account_id is null
      and credit_transaction_id is null
    )
  )
);

create index if not exists wallet_transactions_wallet_date_idx
  on public.wallet_transactions (wallet_id, occurred_on desc, created_at desc);

-- DOWN
-- drop table if exists public.wallet_transactions cascade;
