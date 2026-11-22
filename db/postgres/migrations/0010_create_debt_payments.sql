-- =============================================================================
-- Migration 0010: Create debt_payments table
-- =============================================================================
-- Dependencies: debts, transactions
-- =============================================================================

-- UP
create table if not exists public.debt_payments (
  id              uuid primary key default gen_random_uuid(),
  debt_id         uuid not null references public.debts(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  paid_on         date not null default current_date,
  transaction_id  uuid not null references public.transactions(id) on delete restrict,
  notes           text
);

create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id);

-- DOWN
-- drop table if exists public.debt_payments cascade;
