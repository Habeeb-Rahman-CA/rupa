-- =============================================================================
-- Migration 0004: Make account_balance view respect RLS
-- Without security_invoker, the view runs as its owner and bypasses RLS on
-- public.transactions, so a new user could see other users' balances.
--
-- SECURITY AUDIT (see also the note in 0001_init.sql):
--   * Views cannot carry their own RLS. This view is safe only because
--     security_invoker = true makes it run as the caller, so the base-table
--     policy (owner_id = auth.uid()) applies. Do not drop this option.
--   * Any future view over owner-scoped tables must do the same.
--   * The 14 SECURITY DEFINER functions added in 0008-0021 were audited:
--     all row-touching ones re-check owner_id = auth.uid(); the three
--     prevent_unmanaged_* triggers only read current_setting()/NEW/OLD, and
--     prevent_over_returned_money only aggregates rows its base table's RLS
--     WITH CHECK already proves belong to the caller.
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
