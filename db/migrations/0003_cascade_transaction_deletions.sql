-- =============================================================================
-- Migration 0003: Cascade transaction deletions & restore debt balances
-- Fixes foreign key restriction on debt_payments, event_expenses, event_settlements
-- when deleting linked transactions.
-- =============================================================================

-- 1. Alter foreign keys on debt_payments to ON DELETE CASCADE
alter table public.debt_payments
  drop constraint if exists debt_payments_transaction_id_fkey,
  add constraint debt_payments_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete cascade;

-- 2. Alter foreign keys on event_expenses to ON DELETE CASCADE
alter table public.event_expenses
  drop constraint if exists event_expenses_transaction_id_fkey,
  add constraint event_expenses_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete cascade;

-- 3. Alter foreign keys on event_settlements to ON DELETE CASCADE
alter table public.event_settlements
  drop constraint if exists event_settlements_transaction_id_fkey,
  add constraint event_settlements_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete cascade;

-- 4. Trigger to restore debt outstanding balance when a debt payment is deleted
create or replace function public.on_debt_payment_deleted()
returns trigger as $$
begin
  update public.debts
  set outstanding = outstanding + OLD.amount,
      closed_on = null
  where id = OLD.debt_id;
  return OLD;
end;
$$ language plpgsql;

drop trigger if exists trg_debt_payment_deleted on public.debt_payments;
create trigger trg_debt_payment_deleted
  after delete on public.debt_payments
  for each row execute function public.on_debt_payment_deleted();
