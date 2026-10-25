-- =============================================================================
-- Migration 0007: Repair legacy key/value app_settings tables
--
-- Some existing Supabase projects have an older app_settings table shaped like:
--   key_name text unique, key_value/value text
--
-- The current application needs one row per authenticated owner instead. The
-- legacy table is renamed, not dropped, so its rows and unique constraint are
-- retained as an archive. A new owner-scoped app_settings table is then created.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Preserve the old key/value table instead of modifying or deleting it
-- -----------------------------------------------------------------------------

do $migration$
begin
  if to_regclass('public.app_settings') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'app_settings'
         and column_name = 'key_name'
     )
     and to_regclass('public.app_settings_legacy') is null then
    alter table public.app_settings rename to app_settings_legacy;
  end if;
end $migration$;

-- -----------------------------------------------------------------------------
-- 2. Create the owner-scoped table expected by the application
-- -----------------------------------------------------------------------------

create table if not exists public.app_settings (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references auth.users(id) on delete cascade,
  openrouter_api_key text,
  updated_at         timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_owner_all on public.app_settings;
create policy app_settings_owner_all on public.app_settings
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Preserve a legacy OpenRouter key when ownership is unambiguous
-- -----------------------------------------------------------------------------

-- The old table was global rather than user-scoped. Import its OpenRouter key
-- only when the project has exactly one auth user; otherwise leave the legacy
-- table untouched so the owner can be assigned explicitly later.
do $migration$
declare
  user_count integer;
  only_user uuid;
  legacy_key text;
begin
  select count(*) into user_count from auth.users;
  if user_count <> 1 or to_regclass('public.app_settings_legacy') is null then
    return;
  end if;

  select id into only_user from auth.users limit 1;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings_legacy'
      and column_name = 'key_value'
  ) then
    execute $sql$
      select key_value::text
      from public.app_settings_legacy
      where lower(key_name::text) in ('openrouter_api_key', 'openrouterapikey')
      order by 1 desc
      limit 1
    $sql$ into legacy_key;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings_legacy'
      and column_name = 'value'
  ) then
    execute $sql$
      select value::text
      from public.app_settings_legacy
      where lower(key_name::text) in ('openrouter_api_key', 'openrouterapikey')
      order by 1 desc
      limit 1
    $sql$ into legacy_key;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings_legacy'
      and column_name = 'openrouter_api_key'
  ) then
    execute $sql$
      select openrouter_api_key::text
      from public.app_settings_legacy
      where openrouter_api_key is not null
      order by 1 desc
      limit 1
    $sql$ into legacy_key;
  end if;

  if nullif(trim(legacy_key), '') is not null then
    insert into public.app_settings (owner_id, openrouter_api_key)
    values (only_user, trim(legacy_key))
    on conflict (owner_id) do update
      set openrouter_api_key = excluded.openrouter_api_key,
          updated_at = now();
  end if;
end $migration$;
