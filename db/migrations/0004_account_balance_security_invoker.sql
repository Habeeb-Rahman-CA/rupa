-- =============================================================================
-- Migration 0004: Make account_balance view respect RLS
-- Without security_invoker, the view runs as its owner and bypasses RLS on
-- public.transactions, so a new user could see other users' balances.
-- =============================================================================

drop view if exists public.account_balance;

create view public.account_balance
with (security_invoker = true) as
select
  owner_id,
  coalesce(sum(case when direction = 'in'  then amount else 0 end), 0)
  - coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    as balance
from public.transactions
group by owner_id;
