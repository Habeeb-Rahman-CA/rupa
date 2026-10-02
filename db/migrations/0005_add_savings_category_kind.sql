-- =============================================================================
-- Migration 0005: Add 'savings' to categories.kind check constraint
-- Allows user categories to be flagged as income, expense, or savings.
-- =============================================================================

alter table public.categories
  drop constraint if exists categories_kind_check,
  add constraint categories_kind_check check (kind in ('income', 'expense', 'savings'));
