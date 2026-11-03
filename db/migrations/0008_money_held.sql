-- =============================================================================
-- Migration 0008: money held for others
--
-- This ledger is intentionally separate from public.transactions. Money received
-- for someone else is not personal income, and money returned is not a personal
-- expense.
-- =============================================================================

create table if not exists public.money_held_people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (owner_id, person_id)
);

create table if not exists public.money_held_transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  held_person_id uuid not null references public.money_held_people(id) on delete restrict,
  direction      text not null check (direction in ('received', 'returned')),
  amount         numeric(14,2) not null check (amount > 0),
  occurred_on    date not null default current_date,
  payment_mode   text not null default 'cash' check (payment_mode in ('cash', 'bank')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists money_held_people_owner_idx
  on public.money_held_people (owner_id, created_at desc);

create index if not exists money_held_transactions_person_date_idx
  on public.money_held_transactions (held_person_id, occurred_on desc, created_at desc);

-- Prevent an invalid record from making a person's held balance negative even
-- when a client is stale or two clients try to return money at once.
create or replace function public.prevent_over_returned_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_held_person_id uuid;
  target_direction text;
  target_amount numeric;
  received_total numeric;
  returned_total numeric;
begin
  if tg_op = 'DELETE' then
    target_held_person_id := old.held_person_id;
    target_direction := old.direction;
    target_amount := old.amount;
  else
    target_held_person_id := new.held_person_id;
    target_direction := new.direction;
    target_amount := new.amount;
  end if;

  -- Serialize balance-changing writes for one held person within a transaction.
  perform pg_advisory_xact_lock(hashtextextended(target_held_person_id::text, 0));

  select
    coalesce(sum(case when direction = 'received' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'returned' then amount else 0 end), 0)
  into received_total, returned_total
  from public.money_held_transactions
  where held_person_id = target_held_person_id
    and id <> coalesce(new.id, old.id);

  if target_direction = 'received' then
    if tg_op <> 'DELETE' then
      received_total := received_total + target_amount;
    end if;
  else
    if tg_op <> 'DELETE' then
      returned_total := returned_total + target_amount;
    end if;
  end if;

  if returned_total > received_total then
    raise exception 'Returned amount cannot exceed money received for this person';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists money_held_balance_guard on public.money_held_transactions;
create trigger money_held_balance_guard
  before insert or update of held_person_id, direction, amount or delete
  on public.money_held_transactions
  for each row execute function public.prevent_over_returned_money();

alter table public.money_held_people enable row level security;
alter table public.money_held_transactions enable row level security;

drop policy if exists money_held_people_owner_all on public.money_held_people;
create policy money_held_people_owner_all on public.money_held_people
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.people p
      where p.id = money_held_people.person_id and p.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.people p
      where p.id = money_held_people.person_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists money_held_transactions_owner_all on public.money_held_transactions;
create policy money_held_transactions_owner_all on public.money_held_transactions
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.money_held_people hp
      where hp.id = money_held_transactions.held_person_id
        and hp.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.money_held_people hp
      where hp.id = money_held_transactions.held_person_id
        and hp.owner_id = auth.uid()
    )
  );
