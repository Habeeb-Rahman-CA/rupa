-- =============================================================================
-- Offline Supabase stub for running db/migrations against a local Postgres.
--
-- Usage (throwaway cluster, no Docker/Supabase CLI needed):
--   initdb -D /tmp/pgdata -U postgres --auth=trust
--   pg_ctl -D /tmp/pgdata -o "-p 5433 -k /tmp" start
--   createdb -h /tmp -p 5433 -U postgres rupa_test
--   psql -h /tmp -p 5433 -U postgres -d rupa_test -v ON_ERROR_STOP=1 \
--        -f db/tests/auth-stub-setup.sql
--   for f in db/migrations/*.sql; do psql ... -f "$f"; done
--   psql ... -f db/tests/reset_user_data_test.sql
-- =============================================================================

-- Minimal Supabase-compatible stub for offline migration testing
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;
