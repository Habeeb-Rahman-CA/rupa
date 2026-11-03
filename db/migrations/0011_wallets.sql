-- =============================================================================
-- Migration 0011: Wallet management and wallet ledger
--
-- Wallet spending is linked to one regular expense transaction. Recharges are
-- represented by linked debit and credit ledger entries and are excluded from
-- income and expense analytics.
-- =============================================================================

-- ---------------------------------------------------------------------------- -
-- 1. Wallets and wallet transactions
-- ---------------------------------------------------------------------------- -

create table if not exists public.wallets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null check (char_length(trim(name)) > 0),
  initial_balance  numeric(14,2) not null default 0 check (initial_balance >= 0),
  balance          numeric(14,2) not null default 0 check (balance >= 0),
  minimum_balance  numeric(14,2) not null default 0 check (minimum_balance >= 0),
  created_at       timestamptz not null default now()
);

create index if not exists wallets_owner_created_idx
  on public.wallets (owner_id, created_at desc);

create table if not exists public.wallet_transactions (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
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

-- Transactions need a wallet reference so the regular ledger row and the
-- wallet ledger row can always be reconciled.
alter table public.transactions
  add column if not exists wallet_id uuid references public.wallets(id) on delete restrict;

alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in (
      'manual', 'debt', 'event', 'opening', 'transfer',
      'wallet_recharge', 'wallet_spend'
    ));

alter table public.transactions
  drop constraint if exists transactions_wallet_source_check,
  add constraint transactions_wallet_source_check
    check (
      (source in ('wallet_recharge', 'wallet_spend') and wallet_id is not null)
      or (source not in ('wallet_recharge', 'wallet_spend') and wallet_id is null)
    );

create index if not exists transactions_wallet_ref_idx
  on public.transactions (owner_id, wallet_id, occurred_on desc)
  where wallet_id is not null;

create unique index if not exists transactions_wallet_source_ref_direction_unique
  on public.transactions (owner_id, source, source_ref_id, direction)
  where source in ('wallet_recharge', 'wallet_spend') and source_ref_id is not null;

-- ---------------------------------------------------------------------------- -
-- 2. Row-level security
-- ---------------------------------------------------------------------------- -

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists wallets_owner_all on public.wallets;
create policy wallets_owner_all on public.wallets
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists wallet_transactions_owner_all on public.wallet_transactions;
create policy wallet_transactions_owner_all on public.wallet_transactions
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.wallets w
      where w.id = wallet_transactions.wallet_id
        and w.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.wallets w
      where w.id = wallet_transactions.wallet_id
        and w.owner_id = auth.uid()
    )
  );

-- Wallet spending is intentionally grouped as “Wallet spending” in the app;
-- it does not require a user-selected expense category.
alter table public.wallet_transactions
  drop constraint if exists wallet_transaction_kind_fields_check,
  add constraint wallet_transaction_kind_fields_check check (
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
  );

-- Keep balances and linked transaction rows under the atomic wallet RPCs.
create or replace function public.prevent_unmanaged_wallet_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'wallets' then
    if tg_op <> 'UPDATE'
       or new.balance is not distinct from old.balance
       or coalesce(current_setting('rupa.wallet_rpc', true), '') = 'on' then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  elsif tg_table_name = 'transactions' then
    if tg_op = 'DELETE' and old.source not in ('wallet_recharge', 'wallet_spend') then
      return old;
    elsif tg_op = 'INSERT' and new.source not in ('wallet_recharge', 'wallet_spend') then
      return new;
    elsif tg_op = 'UPDATE'
      and old.source not in ('wallet_recharge', 'wallet_spend')
      and new.source not in ('wallet_recharge', 'wallet_spend') then
      return new;
    end if;
  end if;

  if coalesce(current_setting('rupa.wallet_rpc', true), '') <> 'on' then
    raise exception 'Wallet records must be changed through the wallet operation.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists wallets_balance_write_guard on public.wallets;
create trigger wallets_balance_write_guard
before update on public.wallets
for each row execute function public.prevent_unmanaged_wallet_writes();

drop trigger if exists wallet_transactions_rpc_write_guard on public.wallet_transactions;
create trigger wallet_transactions_rpc_write_guard
before insert or update or delete on public.wallet_transactions
for each row execute function public.prevent_unmanaged_wallet_writes();

drop trigger if exists wallet_transactions_ledger_write_guard on public.transactions;
create trigger wallet_transactions_ledger_write_guard
before insert or update or delete on public.transactions
for each row execute function public.prevent_unmanaged_wallet_writes();

-- ---------------------------------------------------------------------------- -
-- 3. Atomic wallet transaction creation
-- ---------------------------------------------------------------------------- -

-- If an earlier draft of this migration was applied, replace its eight-argument
-- function with the idempotent nine-argument version below.
drop function if exists public.create_wallet_transaction(uuid, text, numeric, date, uuid, text, uuid, text);

create or replace function public.create_wallet_transaction(
  p_wallet_id uuid,
  p_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_category_id uuid default null,
  p_funding_mode text default null,
  p_bank_account_id uuid default null,
  p_notes text default null,
  p_request_id uuid default null
)
returns setof public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallets%rowtype;
  amount_to_move numeric(14,2);
  source_balance numeric(14,2);
  wallet_transaction_id uuid := gen_random_uuid();
  debit_transaction_id uuid := gen_random_uuid();
  credit_transaction_id uuid;
  existing_transaction public.wallet_transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.wallet_rpc', 'on', true);

  wallet_transaction_id := coalesce(p_request_id, wallet_transaction_id);
  if p_request_id is not null then
    select * into existing_transaction
    from public.wallet_transactions
    where id = wallet_transaction_id;

    if found then
      if existing_transaction.owner_id <> auth.uid() then
        raise exception 'Wallet transaction request id is already in use.' using errcode = 'P0001';
      end if;
      -- A retried request returns the already-committed row without applying
      -- its balance deltas or inserting another pair of ledger records.
      return query
      select * from public.wallet_transactions where id = wallet_transaction_id;
      return;
    end if;
  end if;

  amount_to_move := round(p_amount, 2);
  if amount_to_move is null or amount_to_move <= 0 then
    raise exception 'Wallet transaction amount must be greater than zero.' using errcode = 'P0001';
  end if;

  select * into wallet_row
  from public.wallets
  where id = p_wallet_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Wallet not found.' using errcode = 'P0001';
  end if;

  if p_kind not in ('recharge', 'spend') then
    raise exception 'Wallet transaction type is invalid.' using errcode = 'P0001';
  end if;

  if p_kind = 'spend' then
    if p_funding_mode is not null or p_bank_account_id is not null then
      raise exception 'Wallet spending cannot include a recharge source.' using errcode = 'P0001';
    end if;

    if wallet_row.balance < amount_to_move then
      raise exception 'Insufficient balance in the wallet.' using errcode = 'P0001';
    end if;
  else
    if p_category_id is not null then
      raise exception 'Wallet recharges cannot have an expense category.' using errcode = 'P0001';
    end if;

    if p_funding_mode not in ('cash', 'bank') then
      raise exception 'Choose cash or a bank account for the recharge.' using errcode = 'P0001';
    end if;

    if p_funding_mode = 'cash' then
      if p_bank_account_id is not null then
        raise exception 'Cash recharges cannot include a bank account.' using errcode = 'P0001';
      end if;
    else
      if p_bank_account_id is null then
        raise exception 'A bank account is required for this recharge.' using errcode = 'P0001';
      end if;

      perform id
      from public.bank_accounts
      where id = p_bank_account_id and owner_id = auth.uid()
      for update;

      select balance into source_balance
      from public.bank_accounts
      where id = p_bank_account_id and owner_id = auth.uid();

      if source_balance is null then
        raise exception 'Bank account not found.' using errcode = 'P0001';
      end if;
      if source_balance < amount_to_move then
        raise exception 'Insufficient balance in the selected bank account.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.transactions (
    id, owner_id, occurred_on, amount, direction, category_id, notes,
    source, source_ref_id, payment_mode, bank_account_id, wallet_id
  ) values (
    debit_transaction_id,
    auth.uid(),
    coalesce(p_occurred_on, current_date),
    amount_to_move,
    'out',
    null,
    nullif(trim(coalesce(p_notes, '')), ''),
    case when p_kind = 'spend' then 'wallet_spend' else 'wallet_recharge' end,
    wallet_transaction_id,
    case when p_kind = 'recharge' then p_funding_mode else 'cash' end,
    case when p_kind = 'recharge' and p_funding_mode = 'bank' then p_bank_account_id else null end,
    p_wallet_id
  );

  if p_kind = 'recharge' then
    credit_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id, owner_id, occurred_on, amount, direction, category_id, notes,
      source, source_ref_id, payment_mode, bank_account_id, wallet_id
    ) values (
      credit_transaction_id,
      auth.uid(),
      coalesce(p_occurred_on, current_date),
      amount_to_move,
      'in',
      null,
      nullif(trim(coalesce(p_notes, '')), ''),
      'wallet_recharge',
      wallet_transaction_id,
      'cash',
      null,
      p_wallet_id
    );
  end if;

  insert into public.wallet_transactions (
    id, owner_id, wallet_id, kind, amount, occurred_on, category_id,
    funding_mode, bank_account_id, notes, debit_transaction_id, credit_transaction_id
  ) values (
    wallet_transaction_id,
    auth.uid(),
    p_wallet_id,
    p_kind,
    amount_to_move,
    coalesce(p_occurred_on, current_date),
    null,
    case when p_kind = 'recharge' then p_funding_mode else null end,
    case when p_kind = 'recharge' and p_funding_mode = 'bank' then p_bank_account_id else null end,
    nullif(trim(coalesce(p_notes, '')), ''),
    debit_transaction_id,
    credit_transaction_id
  );

  if p_kind = 'recharge' then
    if p_funding_mode = 'bank' then
      update public.bank_accounts
      set balance = balance - amount_to_move
      where id = p_bank_account_id and owner_id = auth.uid();
    end if;

    update public.wallets
    set balance = balance + amount_to_move
    where id = p_wallet_id and owner_id = auth.uid();
  else
    update public.wallets
    set balance = balance - amount_to_move
    where id = p_wallet_id and owner_id = auth.uid();
  end if;

  return query
  select * from public.wallet_transactions where id = wallet_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 4. Atomic wallet transaction editing
-- ---------------------------------------------------------------------------- -

create or replace function public.update_wallet_transaction(
  p_wallet_transaction_id uuid,
  p_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_category_id uuid default null,
  p_funding_mode text default null,
  p_bank_account_id uuid default null,
  p_notes text default null
)
returns setof public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_transaction public.wallet_transactions%rowtype;
  wallet_row public.wallets%rowtype;
  amount_to_move numeric(14,2);
  calculated_balance numeric(14,2);
  source_balance numeric(14,2);
  updated_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.wallet_rpc', 'on', true);

  amount_to_move := round(p_amount, 2);
  if amount_to_move is null or amount_to_move <= 0 then
    raise exception 'Wallet transaction amount must be greater than zero.' using errcode = 'P0001';
  end if;
  if p_kind not in ('recharge', 'spend') then
    raise exception 'Wallet transaction type is invalid.' using errcode = 'P0001';
  end if;

  select * into current_transaction
  from public.wallet_transactions
  where id = p_wallet_transaction_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Wallet transaction not found.' using errcode = 'P0001';
  end if;

  if current_transaction.kind <> p_kind then
    raise exception 'Wallet transaction type cannot be changed after saving.' using errcode = 'P0001';
  end if;

  select * into wallet_row
  from public.wallets
  where id = current_transaction.wallet_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Wallet not found.' using errcode = 'P0001';
  end if;

  -- Lock every bank account involved in the old or edited recharge.
  perform id
  from public.bank_accounts
  where owner_id = auth.uid()
    and id in (
      current_transaction.bank_account_id,
      case when p_funding_mode = 'bank' then p_bank_account_id else null end
    )
  order by id
  for update;

  calculated_balance := wallet_row.balance;
  if current_transaction.kind = 'recharge' then
    calculated_balance := calculated_balance - current_transaction.amount;
    if current_transaction.bank_account_id is not null then
      update public.bank_accounts
      set balance = balance + current_transaction.amount
      where id = current_transaction.bank_account_id and owner_id = auth.uid();
    end if;
  else
    calculated_balance := calculated_balance + current_transaction.amount;
  end if;

  if p_kind = 'spend' then
    if p_funding_mode is not null or p_bank_account_id is not null then
      raise exception 'Wallet spending cannot include a recharge source.' using errcode = 'P0001';
    end if;
    calculated_balance := calculated_balance - amount_to_move;
  else
    if p_category_id is not null then
      raise exception 'Wallet recharges cannot have an expense category.' using errcode = 'P0001';
    end if;
    if p_funding_mode not in ('cash', 'bank') then
      raise exception 'Choose cash or a bank account for the recharge.' using errcode = 'P0001';
    end if;
    if p_funding_mode = 'cash' then
      if p_bank_account_id is not null then
        raise exception 'Cash recharges cannot include a bank account.' using errcode = 'P0001';
      end if;
    else
      if p_bank_account_id is null then
        raise exception 'A bank account is required for this recharge.' using errcode = 'P0001';
      end if;
      select balance into source_balance
      from public.bank_accounts
      where id = p_bank_account_id and owner_id = auth.uid();
      if source_balance is null then
        raise exception 'Bank account not found.' using errcode = 'P0001';
      end if;
      if source_balance < amount_to_move then
        raise exception 'Insufficient balance in the selected bank account.' using errcode = 'P0001';
      end if;
      update public.bank_accounts
      set balance = balance - amount_to_move
      where id = p_bank_account_id and owner_id = auth.uid();
    end if;
    calculated_balance := calculated_balance + amount_to_move;
  end if;

  if calculated_balance < 0 then
    raise exception 'This change would make the wallet balance negative.' using errcode = 'P0001';
  end if;

  update public.transactions
  set occurred_on = coalesce(p_occurred_on, current_date),
      amount = amount_to_move,
      direction = 'out',
      category_id = null,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      source = case when p_kind = 'spend' then 'wallet_spend' else 'wallet_recharge' end,
      source_ref_id = p_wallet_transaction_id,
      payment_mode = case when p_kind = 'recharge' then p_funding_mode else 'cash' end,
      bank_account_id = case when p_kind = 'recharge' and p_funding_mode = 'bank' then p_bank_account_id else null end,
      wallet_id = current_transaction.wallet_id
  where id = current_transaction.debit_transaction_id
    and owner_id = auth.uid();
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Linked wallet debit transaction is missing.' using errcode = 'P0001';
  end if;

  if p_kind = 'recharge' then
    update public.transactions
    set occurred_on = coalesce(p_occurred_on, current_date),
        amount = amount_to_move,
        direction = 'in',
        category_id = null,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        source = 'wallet_recharge',
        source_ref_id = p_wallet_transaction_id,
        payment_mode = 'cash',
        bank_account_id = null,
        wallet_id = current_transaction.wallet_id
    where id = current_transaction.credit_transaction_id
      and owner_id = auth.uid();
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
      raise exception 'Linked wallet credit transaction is missing.' using errcode = 'P0001';
    end if;
  end if;

  update public.wallet_transactions
  set kind = p_kind,
      amount = amount_to_move,
      occurred_on = coalesce(p_occurred_on, current_date),
      category_id = null,
      funding_mode = case when p_kind = 'recharge' then p_funding_mode else null end,
      bank_account_id = case when p_kind = 'recharge' and p_funding_mode = 'bank' then p_bank_account_id else null end,
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_wallet_transaction_id and owner_id = auth.uid();

  update public.wallets
  set balance = calculated_balance
  where id = current_transaction.wallet_id and owner_id = auth.uid();

  return query
  select * from public.wallet_transactions where id = p_wallet_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------- -
-- 5. Atomic wallet transaction deletion
-- ---------------------------------------------------------------------------- -

create or replace function public.delete_wallet_transaction(p_wallet_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_transaction public.wallet_transactions%rowtype;
  wallet_row public.wallets%rowtype;
  calculated_balance numeric(14,2);
  deleted_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  perform set_config('rupa.wallet_rpc', 'on', true);

  select * into current_transaction
  from public.wallet_transactions
  where id = p_wallet_transaction_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Wallet transaction not found.' using errcode = 'P0001';
  end if;

  select * into wallet_row
  from public.wallets
  where id = current_transaction.wallet_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Wallet not found.' using errcode = 'P0001';
  end if;

  if current_transaction.bank_account_id is not null then
    perform id
    from public.bank_accounts
    where id = current_transaction.bank_account_id and owner_id = auth.uid()
    for update;
  end if;

  if current_transaction.kind = 'recharge' then
    calculated_balance := wallet_row.balance - current_transaction.amount;
    if current_transaction.bank_account_id is not null then
      update public.bank_accounts
      set balance = balance + current_transaction.amount
      where id = current_transaction.bank_account_id and owner_id = auth.uid();
    end if;
  else
    calculated_balance := wallet_row.balance + current_transaction.amount;
  end if;

  if calculated_balance < 0 then
    raise exception 'This recharge cannot be deleted because later spending uses it.'
      using errcode = 'P0001';
  end if;

  delete from public.wallet_transactions
  where id = p_wallet_transaction_id and owner_id = auth.uid();
  get diagnostics deleted_rows = row_count;
  if deleted_rows <> 1 then
    raise exception 'Wallet transaction could not be deleted.' using errcode = 'P0001';
  end if;

  delete from public.transactions
  where id in (
    current_transaction.debit_transaction_id,
    current_transaction.credit_transaction_id
  )
    and owner_id = auth.uid();
  get diagnostics deleted_rows = row_count;
  if (current_transaction.kind = 'recharge' and deleted_rows <> 2)
     or (current_transaction.kind = 'spend' and deleted_rows <> 1) then
    raise exception 'Linked wallet ledger transaction is missing.' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance = calculated_balance
  where id = current_transaction.wallet_id and owner_id = auth.uid();
end;
$$;

grant execute on function public.create_wallet_transaction(uuid, text, numeric, date, uuid, text, uuid, text, uuid) to authenticated;
grant execute on function public.update_wallet_transaction(uuid, text, numeric, date, uuid, text, uuid, text) to authenticated;
grant execute on function public.delete_wallet_transaction(uuid) to authenticated;

revoke execute on function public.create_wallet_transaction(uuid, text, numeric, date, uuid, text, uuid, text, uuid) from public, anon;
revoke execute on function public.update_wallet_transaction(uuid, text, numeric, date, uuid, text, uuid, text) from public, anon;
revoke execute on function public.delete_wallet_transaction(uuid) from public, anon;
