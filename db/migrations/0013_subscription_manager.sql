-- =============================================================================
-- Migration 0013: Subscription manager
--
-- Renewal dates are planning data. They never create ledger transactions by
-- themselves. A subscription payment is an explicit record linked to one
-- existing expense transaction (or to a transaction created by that action).
-- =============================================================================

create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null check (char_length(trim(name)) > 0),
  category            text not null default 'Other',
  amount              numeric(14,2) not null check (amount > 0),
  billing_cycle       text not null check (billing_cycle in ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date          date not null,
  next_renewal_date   date not null,
  end_date            date,
  payment_account_id  uuid references public.bank_accounts(id) on delete set null,
  auto_renewal        boolean not null default true,
  status              text not null default 'active'
                      check (status in ('active', 'paused', 'cancelled', 'expired')),
  cancelled_on        date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint subscriptions_dates_check check (end_date is null or end_date >= start_date)
);

create index if not exists subscriptions_owner_renewal_idx
  on public.subscriptions (owner_id, next_renewal_date);

create index if not exists subscriptions_owner_status_idx
  on public.subscriptions (owner_id, status);

create table if not exists public.subscription_price_changes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  old_amount       numeric(14,2) not null check (old_amount > 0),
  new_amount       numeric(14,2) not null check (new_amount > 0),
  effective_on     date not null default current_date,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists subscription_price_changes_history_idx
  on public.subscription_price_changes (subscription_id, effective_on desc, created_at desc);

create table if not exists public.subscription_renewals (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  due_on           date not null,
  renewed_on       date not null,
  amount           numeric(14,2) not null check (amount > 0),
  status           text not null default 'completed' check (status in ('completed', 'skipped')),
  notes            text,
  created_at       timestamptz not null default now()
);

create unique index if not exists subscription_renewals_once_per_due_date
  on public.subscription_renewals (subscription_id, due_on);

create index if not exists subscription_renewals_history_idx
  on public.subscription_renewals (subscription_id, renewed_on desc, created_at desc);

create table if not exists public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  renewal_id       uuid not null references public.subscription_renewals(id) on delete cascade,
  amount           numeric(14,2) not null check (amount > 0),
  paid_on          date not null,
  transaction_id   uuid unique references public.transactions(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists subscription_payments_history_idx
  on public.subscription_payments (subscription_id, paid_on desc, created_at desc);

alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in (
      'manual', 'debt', 'event', 'opening', 'transfer',
      'wallet_recharge', 'wallet_spend', 'subscription'
    ));

alter table public.subscriptions enable row level security;
alter table public.subscription_price_changes enable row level security;
alter table public.subscription_renewals enable row level security;
alter table public.subscription_payments enable row level security;

drop policy if exists subscriptions_owner_all on public.subscriptions;
create policy subscriptions_owner_all on public.subscriptions
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists subscription_price_changes_owner_all on public.subscription_price_changes;
create policy subscription_price_changes_owner_all on public.subscription_price_changes
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_price_changes.subscription_id and s.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_price_changes.subscription_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists subscription_renewals_owner_all on public.subscription_renewals;
create policy subscription_renewals_owner_all on public.subscription_renewals
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_renewals.subscription_id and s.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_renewals.subscription_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists subscription_payments_owner_all on public.subscription_payments;
create policy subscription_payments_owner_all on public.subscription_payments
  for all using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_payments.subscription_id and s.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_payments.subscription_id and s.owner_id = auth.uid()
    )
  );
