-- =============================================================================
-- Migration 0017: Web Push notifications
--
-- Components:
--   * push_subscriptions    — one row per registered device browser (a user may
--                             have several: phone + laptop, etc.)
--   * push_preferences      — per-category opt-in/out; a missing row means the
--                             category is enabled (opt-out model)
--   * push_notification_log — de-duplication so a reminder fires exactly once
--                             per event (renewal date / wallet-per-day)
--   * push_config           — small backend-only key/value config (cron secret).
--                             RLS is enabled with NO client policies: only the
--                             service role (backend) can read it.
--
-- Sending happens in the Edge Function supabase/functions/push-notifications.
-- The VAPID private key lives only there (as a function secret) — it is never
-- part of this repo, the migrations, or the Angular app.
--
-- pg_cron + pg_net invoke the function every 15 minutes for the scheduled
-- categories (renewals, low balance). If the extensions are not enabled the
-- migration still succeeds — it only prints a notice (see section 4).
-- =============================================================================

-- ------------------------------ subscriptions -------------------------------

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A device may re-subscribe with the same endpoint — keep one row per
-- (owner, endpoint) so upserts heal instead of duplicating.
create unique index if not exists push_subscriptions_owner_endpoint_idx
  on public.push_subscriptions (owner_id, endpoint);

create index if not exists push_subscriptions_owner_idx
  on public.push_subscriptions (owner_id);

-- ------------------------------- preferences --------------------------------

create table if not exists public.push_preferences (
  owner_id    uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('renewals', 'low_balance')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, category)
);

-- -------------------------------- send log ----------------------------------

create table if not exists public.push_notification_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('renewals', 'low_balance')),
  -- what fired, e.g. 'sub:<subscription-id>:2026-11-20' or 'wallet:<id>:2026-11-14'
  ref         text not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, category, ref)
);

create index if not exists push_notification_log_created_idx
  on public.push_notification_log (created_at);

-- --------------------------------- config -----------------------------------

create table if not exists public.push_config (
  name        text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- ----------------------------- Row level security ---------------------------

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_all on public.push_subscriptions;
create policy push_subscriptions_owner_all on public.push_subscriptions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table public.push_preferences enable row level security;

drop policy if exists push_preferences_owner_all on public.push_preferences;
create policy push_preferences_owner_all on public.push_preferences
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table public.push_notification_log enable row level security;

drop policy if exists push_notification_log_owner_read on public.push_notification_log;
create policy push_notification_log_owner_read on public.push_notification_log
  for select
  using (owner_id = auth.uid());

-- push_config: RLS enabled, no policies → clients get nothing; the backend
-- (service role) bypasses RLS.
alter table public.push_config enable row level security;

-- Random secret the scheduler uses to authenticate to the Edge Function.
-- Read it with:
--   select value from public.push_config where name = 'cron_secret';
insert into public.push_config (name, value)
values ('cron_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- ------------------------- 4. Scheduled invocation --------------------------
-- Every 15 minutes pg_cron asks pg_net to POST to the Edge Function, which
-- then checks renewal dates and wallet balances and sends notifications.
--
-- This section needs the pg_cron and pg_net extensions. They are attempted
-- here; if either cannot be created/used the migration still succeeds and
-- prints a notice instead of failing. To retry later, enable both extensions
-- (Dashboard → Database → Extensions) and re-run only section 4.

do $$
begin
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  -- Unschedule first so re-running the migration does not duplicate the job.
  begin
    perform cron.unschedule('rupa-push-notifications');
  exception
    when others then null; -- job did not exist yet
  end;

  perform cron.schedule(
    'rupa-push-notifications',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://kulwhzrhmpcdgwgamjzx.supabase.co/functions/v1/push-notifications',
        body := jsonb_build_object('action', 'scheduled'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select value from public.push_config where name = 'cron_secret'
          )
        ),
        timeout_milliseconds := 30000
      );
    $job$
  );

  raise notice 'push: cron job "rupa-push-notifications" scheduled every 15 minutes.';
exception
  when others then
    raise notice 'push: cron NOT scheduled (%) — enable the pg_cron and pg_net extensions (Dashboard → Database → Extensions), then run section 4 of this migration again.', sqlerrm;
end $$;
