-- =============================================================================
-- Migration 0027: Create events family of tables
-- =============================================================================
-- Dependencies: users, people, transactions
--
-- Group expenses (trips / functions) with equal splits and full settlement.
-- Ledger rows created for event expenses and settlements carry
-- source = 'event' / 'settlement' and are written inside a NestJS transaction
-- (EventsService) together with the bank balance side effect.
--
-- NOTE: the Supabase schema dropped this family in 0019_cleanup_unused.sql
-- because no UI existed. Phase 3 of the NestJS migration implements the
-- Events & Settlements module, so the tables are recreated here.
-- =============================================================================

-- UP
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  kind        text,
  starts_on   date not null,
  ends_on     date,
  notes       text,
  status      text not null default 'open' check (status in ('open','settled')),
  created_at  timestamptz not null default now()
);

create table if not exists public.event_participants (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  person_id   uuid references public.people(id) on delete restrict,
  is_you      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (event_id, person_id)
);

create table if not exists public.event_expenses (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  description     text not null,
  amount          numeric(14,2) not null check (amount > 0),
  paid_on         date not null default current_date,
  transaction_id  uuid references public.transactions(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table if not exists public.event_expense_participants (
  id                    uuid primary key default gen_random_uuid(),
  event_expense_id      uuid not null references public.event_expenses(id) on delete cascade,
  event_participant_id  uuid not null references public.event_participants(id) on delete cascade,
  created_at            timestamptz not null default now(),
  unique (event_expense_id, event_participant_id)
);

create table if not exists public.event_settlements (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  event_participant_id  uuid not null references public.event_participants(id) on delete cascade,
  paid_on               date not null default current_date,
  transaction_id        uuid not null references public.transactions(id) on delete cascade,
  created_at            timestamptz not null default now(),
  unique (event_id, event_participant_id)  -- paid-in-full only
);

create index if not exists events_owner_start_idx
  on public.events (owner_id, starts_on desc, created_at desc);

create index if not exists event_expenses_event_idx
  on public.event_expenses (event_id, paid_on desc, created_at desc);

create index if not exists event_settlements_event_idx
  on public.event_settlements (event_id, paid_on desc, created_at desc);

-- DOWN
-- drop table if exists public.event_settlements cascade;
-- drop table if exists public.event_expense_participants cascade;
-- drop table if exists public.event_expenses cascade;
-- drop table if exists public.event_participants cascade;
-- drop table if exists public.events cascade;
