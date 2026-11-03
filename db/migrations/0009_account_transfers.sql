-- =============================================================================
-- Migration 0009: Account-to-account transfers
--
-- Transfers are represented by one history row and two linked ledger rows:
--   debit  - money leaving the source account
--   credit - money entering the destination account
--
-- The RPCs below update both bank account balances and both ledger rows in the
-- same database transaction. Clients should use the RPCs instead of writing
-- transfer rows or transfer ledger rows directly.
-- =============================================================================

-- ---------------------------------------------------------------------------- -
-- 1. Transfer history
-- ---------------------------------------------------------------------------- -

create table if not exists public.transfers (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users(id) on delete cascade,
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

-- Add the transfer source to deployments that already have the original source
-- constraint from migration 0006.
alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'debt', 'event', 'opening', 'transfer'));

alter table public.transfers enable row level security;

drop policy if exists transfers_owner_all on public.transfers;
create policy transfers_owner_all on public.transfers
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Keep transfer records under the RPCs so a client cannot remove one half of a
-- transfer or change its history without applying the matching balance updates.
create or replace function public.prevent_unmanaged_transfer_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'transactions' then
    if tg_op = 'DELETE' and old.source <> 'transfer' then
      return old;
    elsif tg_op = 'INSERT' and new.source <> 'transfer' then
      return new;
    elsif tg_op = 'UPDATE' and old.source <> 'transfer' and new.source <> 'transfer' then
      return new;
    end if;
  end if;

  if coalesce(current_setting('rupa.transfer_rpc', true), '') <> 'on' then
    raise exception 'Transfer records must be changed through the transfer operation.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists transfers_rpc_write_guard on public.transfers;
create trigger transfers_rpc_write_guard
before insert or update or delete on public.transfers
for each row execute function public.prevent_unmanaged_transfer_writes();

drop trigger if exists transfer_transactions_rpc_write_guard on public.transactions;
create trigger transfer_transactions_rpc_write_guard
before insert or update or delete on public.transactions
for each row
execute function public.prevent_unmanaged_transfer_writes();

-- ---------------------------------------------------------------------------- -
-- 2. Atomic transfer creation
-- ---------------------------------------------------------------------------- -

create or replace function public.create_account_transfer(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_notes text default null
)
returns setof public.transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_id uuid := gen_random_uuid();
  debit_id uuid;
  credit_id uuid;
  amount_to_move numeric(14,2);
  source_balance numeric(14,2);
  found_accounts integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.transfer_rpc', 'on', true);

  if p_source_account_id is null or p_destination_account_id is null then
    raise exception 'Source and destination accounts are required.' using errcode = 'P0001';
  end if;

  if p_source_account_id = p_destination_account_id then
    raise exception 'Source and destination accounts must be different.' using errcode = 'P0001';
  end if;

  amount_to_move := round(p_amount, 2);
  if amount_to_move is null or amount_to_move <= 0 then
    raise exception 'Transfer amount must be greater than zero.' using errcode = 'P0001';
  end if;

  -- Lock in id order so concurrent transfers cannot deadlock each other.
  perform id
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (p_source_account_id, p_destination_account_id)
  order by id
  for update;

  select count(*) into found_accounts
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (p_source_account_id, p_destination_account_id);

  if found_accounts <> 2 then
    raise exception 'Both accounts must belong to the signed-in user.' using errcode = 'P0001';
  end if;

  select balance into source_balance
  from public.bank_accounts
  where id = p_source_account_id
    and owner_id = auth.uid();

  if source_balance < amount_to_move then
    raise exception 'Insufficient balance in the source account.' using errcode = 'P0001';
  end if;

  insert into public.transfers (
    id,
    owner_id,
    source_account_id,
    destination_account_id,
    amount,
    occurred_on,
    notes
  ) values (
    transfer_id,
    auth.uid(),
    p_source_account_id,
    p_destination_account_id,
    amount_to_move,
    coalesce(p_occurred_on, current_date),
    nullif(trim(coalesce(p_notes, '')), '')
  );

  insert into public.transactions (
    owner_id, occurred_on, amount, direction, category_id, notes,
    source, source_ref_id, payment_mode, bank_account_id
  ) values (
    auth.uid(), coalesce(p_occurred_on, current_date), amount_to_move, 'out', null,
    nullif(trim(coalesce(p_notes, '')), ''), 'transfer', transfer_id, 'bank', p_source_account_id
  ) returning id into debit_id;

  insert into public.transactions (
    owner_id, occurred_on, amount, direction, category_id, notes,
    source, source_ref_id, payment_mode, bank_account_id
  ) values (
    auth.uid(), coalesce(p_occurred_on, current_date), amount_to_move, 'in', null,
    nullif(trim(coalesce(p_notes, '')), ''), 'transfer', transfer_id, 'bank', p_destination_account_id
  ) returning id into credit_id;

  update public.bank_accounts
  set balance = balance - amount_to_move
  where id = p_source_account_id and owner_id = auth.uid();

  update public.bank_accounts
  set balance = balance + amount_to_move
  where id = p_destination_account_id and owner_id = auth.uid();

  update public.transfers
  set debit_transaction_id = debit_id,
      credit_transaction_id = credit_id
  where id = transfer_id;

  return query select * from public.transfers where id = transfer_id;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 3. Atomic transfer editing
-- ---------------------------------------------------------------------------- -

create or replace function public.update_account_transfer(
  p_transfer_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_notes text default null
)
returns setof public.transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_transfer public.transfers%rowtype;
  amount_to_move numeric(14,2);
  source_balance numeric(14,2);
  found_accounts integer;
  required_accounts integer;
  updated_transactions integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.transfer_rpc', 'on', true);

  if p_source_account_id is null or p_destination_account_id is null then
    raise exception 'Source and destination accounts are required.' using errcode = 'P0001';
  end if;

  if p_source_account_id = p_destination_account_id then
    raise exception 'Source and destination accounts must be different.' using errcode = 'P0001';
  end if;

  amount_to_move := round(p_amount, 2);
  if amount_to_move is null or amount_to_move <= 0 then
    raise exception 'Transfer amount must be greater than zero.' using errcode = 'P0001';
  end if;

  select * into current_transfer
  from public.transfers
  where id = p_transfer_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Transfer not found.' using errcode = 'P0001';
  end if;

  if current_transfer.debit_transaction_id is null
     or current_transfer.credit_transaction_id is null then
    raise exception 'Transfer ledger records are incomplete.' using errcode = 'P0001';
  end if;

  select count(distinct account_id) into required_accounts
  from unnest(array[
    current_transfer.source_account_id,
    current_transfer.destination_account_id,
    p_source_account_id,
    p_destination_account_id
  ]::uuid[]) as account_ids(account_id);

  -- Lock every account involved in the old or new transfer in id order.
  perform id
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (
      current_transfer.source_account_id,
      current_transfer.destination_account_id,
      p_source_account_id,
      p_destination_account_id
    )
  order by id
  for update;

  select count(*) into found_accounts
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (
      current_transfer.source_account_id,
      current_transfer.destination_account_id,
      p_source_account_id,
      p_destination_account_id
    );

  if found_accounts <> required_accounts then
    raise exception 'All transfer accounts must belong to the signed-in user.' using errcode = 'P0001';
  end if;

  -- Put the old transfer back, then validate and apply the new transfer.
  update public.bank_accounts
  set balance = balance + current_transfer.amount
  where id = current_transfer.source_account_id and owner_id = auth.uid();

  update public.bank_accounts
  set balance = balance - current_transfer.amount
  where id = current_transfer.destination_account_id and owner_id = auth.uid();

  select balance into source_balance
  from public.bank_accounts
  where id = p_source_account_id and owner_id = auth.uid();

  if source_balance < amount_to_move then
    raise exception 'Insufficient balance in the source account.' using errcode = 'P0001';
  end if;

  update public.bank_accounts
  set balance = balance - amount_to_move
  where id = p_source_account_id and owner_id = auth.uid();

  update public.bank_accounts
  set balance = balance + amount_to_move
  where id = p_destination_account_id and owner_id = auth.uid();

  update public.transactions
  set occurred_on = coalesce(p_occurred_on, current_date),
      amount = amount_to_move,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      direction = 'out',
      category_id = null,
      source = 'transfer',
      source_ref_id = p_transfer_id,
      payment_mode = 'bank',
      bank_account_id = p_source_account_id
  where id = current_transfer.debit_transaction_id
    and owner_id = auth.uid();
  get diagnostics updated_transactions = row_count;
  if updated_transactions <> 1 then
    raise exception 'Transfer debit ledger record is missing.' using errcode = 'P0001';
  end if;

  update public.transactions
  set occurred_on = coalesce(p_occurred_on, current_date),
      amount = amount_to_move,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      direction = 'in',
      category_id = null,
      source = 'transfer',
      source_ref_id = p_transfer_id,
      payment_mode = 'bank',
      bank_account_id = p_destination_account_id
  where id = current_transfer.credit_transaction_id
    and owner_id = auth.uid();
  get diagnostics updated_transactions = row_count;
  if updated_transactions <> 1 then
    raise exception 'Transfer credit ledger record is missing.' using errcode = 'P0001';
  end if;

  update public.transfers
  set source_account_id = p_source_account_id,
      destination_account_id = p_destination_account_id,
      amount = amount_to_move,
      occurred_on = coalesce(p_occurred_on, current_date),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_transfer_id and owner_id = auth.uid();

  return query select * from public.transfers where id = p_transfer_id;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 4. Atomic transfer deletion
-- ---------------------------------------------------------------------------- -

create or replace function public.delete_account_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_transfer public.transfers%rowtype;
  found_accounts integer;
  deleted_transactions integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.transfer_rpc', 'on', true);

  select * into current_transfer
  from public.transfers
  where id = p_transfer_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Transfer not found.' using errcode = 'P0001';
  end if;

  perform id
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (current_transfer.source_account_id, current_transfer.destination_account_id)
  order by id
  for update;

  select count(*) into found_accounts
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (current_transfer.source_account_id, current_transfer.destination_account_id);

  if found_accounts <> 2 then
    raise exception 'Transfer accounts could not be found.' using errcode = 'P0001';
  end if;

  update public.bank_accounts
  set balance = balance + current_transfer.amount
  where id = current_transfer.source_account_id and owner_id = auth.uid();

  update public.bank_accounts
  set balance = balance - current_transfer.amount
  where id = current_transfer.destination_account_id and owner_id = auth.uid();

  delete from public.transactions
  where owner_id = auth.uid()
    and id in (current_transfer.debit_transaction_id, current_transfer.credit_transaction_id);
  get diagnostics deleted_transactions = row_count;

  if deleted_transactions <> 2 then
    raise exception 'Transfer ledger records are incomplete.' using errcode = 'P0001';
  end if;

  delete from public.transfers
  where id = p_transfer_id and owner_id = auth.uid();
end;
$$;

grant execute on function public.create_account_transfer(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.update_account_transfer(uuid, uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_account_transfer(uuid) to authenticated;

revoke execute on function public.create_account_transfer(uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.update_account_transfer(uuid, uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.delete_account_transfer(uuid) from public, anon;
