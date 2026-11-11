-- =============================================================================
-- Migration 0015: Interest (Riba) tracker
--
-- Records interest actually credited by bank accounts, tracks that it was
-- separated (set aside) and finally disposed (given away), and keeps a full
-- disposal history.
--
-- Deliberately isolated from personal finance:
--   * its own two tables — nothing here is ever written to public.transactions,
--   * no categories are involved, so interest is never classified as income,
--     expense, or savings, and never reaches reports or the dashboard totals,
--   * bank account balances are never modified by this module.
-- Only manually entered (actually credited) amounts count; there is no
-- estimated/expected interest in the model at all.
--
-- Entry stages: received -> separated -> disposed.
--   * 'separated' is marked manually (money set aside, awaiting disposal).
--   * 'disposed'  means interest_disposals rows fully cover the entry amount.
-- Pending balance = sum(entries.amount) - sum(disposals.amount). Each disposal
-- is bounded by the remaining interest of its entry (enforced in the app), so
-- the pending balance can never go negative.
-- =============================================================================

create table if not exists public.interest_entries (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  bank_account_id   uuid not null references public.bank_accounts(id) on delete restrict,
  occurred_on       date not null default current_date,
  amount            numeric(14,2) not null check (amount > 0),
  stage             text not null default 'received'
                    check (stage in ('received', 'separated', 'disposed')),
  separated_on      date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Duplicate protection: the same credit can only be recorded once per owner,
-- date, bank account, and amount. The app also checks this before inserting.
create unique index if not exists interest_entries_unique_credit_idx
  on public.interest_entries (owner_id, occurred_on, bank_account_id, amount);

create index if not exists interest_entries_owner_date_idx
  on public.interest_entries (owner_id, occurred_on desc, created_at desc);

create table if not exists public.interest_disposals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- restrict: an interest entry cannot be deleted while its disposals exist;
  -- the app blocks this with a friendly message before the database is hit.
  entry_id      uuid not null references public.interest_entries(id) on delete restrict,
  occurred_on   date not null default current_date,
  amount        numeric(14,2) not null check (amount > 0),
  recipient     text not null check (char_length(trim(recipient)) > 0),
  purpose       text not null check (char_length(trim(purpose)) > 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists interest_disposals_owner_date_idx
  on public.interest_disposals (owner_id, occurred_on desc, created_at desc);

create index if not exists interest_disposals_entry_idx
  on public.interest_disposals (entry_id);

-- ----------------------------- Row level security ---------------------------

alter table public.interest_entries enable row level security;

drop policy if exists interest_entries_owner_all on public.interest_entries;
create policy interest_entries_owner_all on public.interest_entries
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table public.interest_disposals enable row level security;

drop policy if exists interest_disposals_owner_all on public.interest_disposals;
create policy interest_disposals_owner_all on public.interest_disposals
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.interest_entries e
      where e.id = entry_id and e.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.interest_entries e
      where e.id = entry_id and e.owner_id = auth.uid()
    )
  );
