-- =============================================================================
-- Migration 0025: Create account_balance view
-- =============================================================================
-- Replicates the running-balance calculation from the Supabase schema.
-- NOTE: In Supabase this view used `security_invoker = true` to inherit RLS.
-- In self-hosted PostgreSQL without RLS, ownership is enforced at the
-- application layer (NestJS), so a standard view is sufficient.
-- =============================================================================

-- UP
create or replace view public.account_balance as
select
  owner_id,
  coalesce(sum(case when direction = 'in'  then amount else 0 end), 0)
  - coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    as balance
from public.transactions
group by owner_id;

-- DOWN
-- drop view if exists public.account_balance;
