-- =============================================================================
-- Personal Expense Management System — initial schema
-- Run in Supabase SQL Editor.  Requires the `auth` schema (built-in).
-- =============================================================================

-- --- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- 1. Master data
-- =============================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('income','expense')),
  created_at  timestamptz not null default now(),
  unique (owner_id, name, kind)
);

create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 2. The ledger (single source of truth for account balance)
-- =============================================================================

create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  occurred_on    date not null,
  amount         numeric(14,2) not null check (amount > 0),
  direction      text not null check (direction in ('in','out')),
  category_id    uuid references public.categories(id) on delete set null,
  notes          text,
  source         text not null default 'manual'
                   check (source in ('manual','debt','event')),
  source_ref_id  uuid,
  created_at     timestamptz not null default now()
);

create index if not exists transactions_owner_date_idx
  on public.transactions (owner_id, occurred_on desc);

-- Convenience view: running account balance
create or replace view public.account_balance as
select
  owner_id,
  coalesce(sum(case when direction = 'in'  then amount else 0 end), 0)
  - coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    as balance
from public.transactions
group by owner_id;

-- =============================================================================
-- 3. Debts (bidirectional lending)
-- =============================================================================

create table if not exists public.debts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete restrict,
  direction    text not null check (direction in ('i_owe','they_owe')),
  principal    numeric(14,2) not null check (principal > 0),
  outstanding  numeric(14,2) not null check (outstanding >= 0),
  reason       text,
  opened_on    date not null default current_date,
  closed_on    date,
  created_at   timestamptz not null default now()
);

create table if not exists public.debt_payments (
  id              uuid primary key default gen_random_uuid(),
  debt_id         uuid not null references public.debts(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  paid_on         date not null default current_date,
  transaction_id  uuid not null references public.transactions(id) on delete restrict,
  notes           text
);

-- =============================================================================
-- 4. Events (trips / functions) — group expenses with equal splits, full settlement
-- =============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text,
  starts_on   date not null,
  ends_on     date,
  notes       text,
  status      text not null default 'open' check (status in ('open','settled')),
  created_at  timestamptz not null default now()
);

create table if not exists public.event_participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  person_id  uuid references public.people(id) on delete restrict,
  is_you     boolean not null default false,
  unique (event_id, person_id)
);

create table if not exists public.event_expenses (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  description     text not null,
  amount          numeric(14,2) not null check (amount > 0),
  paid_on         date not null default current_date,
  transaction_id  uuid not null references public.transactions(id) on delete restrict
);

create table if not exists public.event_expense_participants (
  id                    uuid primary key default gen_random_uuid(),
  event_expense_id      uuid not null references public.event_expenses(id) on delete cascade,
  event_participant_id  uuid not null references public.event_participants(id) on delete cascade,
  unique (event_expense_id, event_participant_id)
);

create table if not exists public.event_settlements (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  event_participant_id  uuid not null references public.event_participants(id) on delete cascade,
  paid_on               date not null default current_date,
  transaction_id        uuid not null references public.transactions(id) on delete restrict,
  unique (event_id, event_participant_id)  -- paid-in-full only
);

-- =============================================================================
-- 5. Row-Level Security — every row is owned by exactly one user
-- =============================================================================

alter table public.categories                enable row level security;
alter table public.people                    enable row level security;
alter table public.transactions              enable row level security;
alter table public.debts                     enable row level security;
alter table public.debt_payments             enable row level security;
alter table public.events                    enable row level security;
alter table public.event_participants        enable row level security;
alter table public.event_expenses            enable row level security;
alter table public.event_expense_participants enable row level security;
alter table public.event_settlements         enable row level security;

-- Owner-only policies for tables with owner_id
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories','people','transactions','debts','events'
  ]
  loop
    execute format($f$
      drop policy if exists %1$s_owner_all on public.%1$s;
      create policy %1$s_owner_all on public.%1$s
        for all using (owner_id = auth.uid())
        with check (owner_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- Child tables — check ownership through the parent
create policy debt_payments_owner_all on public.debt_payments
  for all using (
    exists (select 1 from public.debts d
            where d.id = debt_payments.debt_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.debts d
            where d.id = debt_payments.debt_id and d.owner_id = auth.uid())
  );

create policy event_participants_owner_all on public.event_participants
  for all using (
    exists (select 1 from public.events e
            where e.id = event_participants.event_id and e.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e
            where e.id = event_participants.event_id and e.owner_id = auth.uid())
  );

create policy event_expenses_owner_all on public.event_expenses
  for all using (
    exists (select 1 from public.events e
            where e.id = event_expenses.event_id and e.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e
            where e.id = event_expenses.event_id and e.owner_id = auth.uid())
  );

create policy event_expense_participants_owner_all on public.event_expense_participants
  for all using (
    exists (
      select 1
      from public.event_expenses ex
      join public.events e on e.id = ex.event_id
      where ex.id = event_expense_participants.event_expense_id
        and e.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.event_expenses ex
      join public.events e on e.id = ex.event_id
      where ex.id = event_expense_participants.event_expense_id
        and e.owner_id = auth.uid()
    )
  );

create policy event_settlements_owner_all on public.event_settlements
  for all using (
    exists (select 1 from public.events e
            where e.id = event_settlements.event_id and e.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e
            where e.id = event_settlements.event_id and e.owner_id = auth.uid())
  );
