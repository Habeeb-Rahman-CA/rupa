-- =============================================================================
-- Migration 0006: Persist bank accounts, payment metadata, and app settings
--
-- This migration is additive. Existing rows in all existing tables are retained.
-- It creates the tables used by the application, adds the missing transaction
-- columns, and backfills existing transactions as cash transactions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bank accounts
-- -----------------------------------------------------------------------------

create table if not exists public.bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  bank_name             text not null,
  account_name          text not null,
  card_type             text not null,
  payment_network       text not null,
  card_number_masked    text not null,
  expiry_date           text not null,
  cardholder_name       text not null,
  account_number_masked text,
  ifsc_code             text,
  balance               numeric(14,2) not null default 0,
  credit_limit          numeric(14,2),
  theme                 text not null default 'blue',
  is_primary            boolean not null default false,
  created_at            timestamptz not null default now()
);

-- Some earlier deployments created bank_accounts without owner_id. CREATE TABLE
-- IF NOT EXISTS does not change an existing table, so add every column that the
-- current app requires before creating policies or indexes that reference it.
alter table public.bank_accounts
  add column if not exists owner_id              uuid references auth.users(id) on delete cascade,
  add column if not exists bank_name             text default 'Unknown bank',
  add column if not exists account_name          text default 'Account',
  add column if not exists card_type             text default 'debit',
  add column if not exists payment_network       text default 'visa',
  add column if not exists card_number_masked    text default '',
  add column if not exists expiry_date           text default '',
  add column if not exists cardholder_name       text default '',
  add column if not exists account_number_masked text,
  add column if not exists ifsc_code             text,
  add column if not exists balance               numeric(14,2) default 0,
  add column if not exists credit_limit          numeric(14,2),
  add column if not exists theme                 text default 'blue',
  add column if not exists is_primary            boolean default false,
  add column if not exists created_at            timestamptz default now();

-- Fill defaults for rows that came from an older, less strict table definition.
update public.bank_accounts
set bank_name = coalesce(bank_name, 'Unknown bank'),
    account_name = coalesce(account_name, 'Account'),
    card_type = coalesce(card_type, 'debit'),
    payment_network = coalesce(payment_network, 'visa'),
    card_number_masked = coalesce(card_number_masked, ''),
    expiry_date = coalesce(expiry_date, ''),
    cardholder_name = coalesce(cardholder_name, ''),
    balance = coalesce(balance, 0),
    theme = coalesce(theme, 'blue'),
    is_primary = coalesce(is_primary, false),
    created_at = coalesce(created_at, now());

-- If this Supabase project has exactly one auth user, existing unowned rows can
-- be assigned safely to that user. If it has multiple users, leave owner_id
-- NULL rather than guessing or exposing one user's data to another user. Those
-- rows remain in the database and can be assigned explicitly after checking
-- their ownership.
do $$
declare
  user_count integer;
  only_user uuid;
begin
  select count(*) into user_count from auth.users;
  if user_count = 1 then
    select id into only_user from auth.users limit 1;
    update public.bank_accounts
    set owner_id = only_user
    where owner_id is null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from public.bank_accounts where owner_id is null limit 1
  ) then
    alter table public.bank_accounts alter column owner_id set not null;
  end if;
end $$;

alter table public.bank_accounts
  alter column owner_id set default auth.uid();

alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_owner_all on public.bank_accounts;
create policy bank_accounts_owner_all on public.bank_accounts
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index if not exists bank_accounts_owner_created_idx
  on public.bank_accounts (owner_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Per-user application settings
-- -----------------------------------------------------------------------------

create table if not exists public.app_settings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references auth.users(id) on delete cascade,
  openrouter_api_key text,
  updated_at        timestamptz not null default now()
);

-- As with bank_accounts, repair an app_settings table created by an older
-- deployment before applying its owner-only policy.
alter table public.app_settings
  add column if not exists owner_id           uuid references auth.users(id) on delete cascade,
  add column if not exists openrouter_api_key text,
  add column if not exists updated_at         timestamptz default now();

update public.app_settings
set updated_at = coalesce(updated_at, now());

do $$
declare
  user_count integer;
  only_user uuid;
begin
  select count(*) into user_count from auth.users;
  if user_count = 1 then
    select id into only_user from auth.users limit 1;
    update public.app_settings
    set owner_id = only_user
    where owner_id is null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from public.app_settings where owner_id is null limit 1
  ) then
    alter table public.app_settings alter column owner_id set not null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_owner_id_key'
      and conrelid = 'public.app_settings'::regclass
  )
  and not exists (
    select owner_id
    from public.app_settings
    where owner_id is not null
    group by owner_id
    having count(*) > 1
  ) then
    alter table public.app_settings
      add constraint app_settings_owner_id_key unique (owner_id);
  end if;
end $$;

alter table public.app_settings
  alter column owner_id set default auth.uid();

alter table public.app_settings enable row level security;

drop policy if exists app_settings_owner_all on public.app_settings;
create policy app_settings_owner_all on public.app_settings
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Transaction metadata used by the bank-account flows
-- -----------------------------------------------------------------------------

-- Keep this migration safe for projects that stopped before migration 0005.
alter table public.categories
  drop constraint if exists categories_kind_check,
  add constraint categories_kind_check check (kind in ('income', 'expense', 'savings'));

alter table public.transactions
  add column if not exists payment_mode text not null default 'cash';

alter table public.transactions
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null;

-- Existing transactions predate payment modes, so they are deliberately
-- treated as cash. This prevents old rows from being silently assigned to a
-- newly-created primary bank account by the client.
update public.transactions
set payment_mode = 'cash'
where payment_mode is null;

alter table public.transactions
  alter column payment_mode set default 'cash';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_payment_mode_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_payment_mode_check
      check (payment_mode in ('cash', 'bank'));
  end if;
end $$;

-- Opening balances are ledger entries and must be accepted by the source
-- constraint. Existing source values remain valid.
alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'debt', 'event', 'opening'));

create index if not exists transactions_bank_account_idx
  on public.transactions (bank_account_id)
  where bank_account_id is not null;
