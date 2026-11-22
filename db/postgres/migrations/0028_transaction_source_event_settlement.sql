-- =============================================================================
-- Migration 0028: Add 'event' and 'settlement' to transactions.source check
-- =============================================================================
-- Dependencies: 0007_create_transactions.sql
--
-- The NestJS Events & Settlements module writes ledger rows with
-- source = 'event' (an expense paid by the group) and source = 'settlement'
-- (money paid back / received between participants). The base constraint from
-- 0007 does not allow either value.
-- =============================================================================

-- UP
alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'debt', 'event', 'settlement', 'opening',
                      'transfer', 'wallet_recharge', 'wallet_spend',
                      'subscription'));

-- DOWN
-- alter table public.transactions
--   drop constraint if exists transactions_source_check,
--   add constraint transactions_source_check
--     check (source in ('manual', 'debt', 'opening', 'transfer',
--                       'wallet_recharge', 'wallet_spend', 'subscription'));
