-- =============================================================================
-- Migration 0025: Daily confirm push notification category
--
-- Adds 'daily_confirm' as a push category so users can opt in/out of the
-- 10 PM daily reminder to confirm all transactions are added.
-- =============================================================================

-- Add 'daily_confirm' to the category check constraint on push_preferences
alter table public.push_preferences
  drop constraint if exists push_preferences_category_check;

alter table public.push_preferences
  add constraint push_preferences_category_check
  check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm'));

-- Add 'daily_confirm' to the category check constraint on push_notification_log
alter table public.push_notification_log
  drop constraint if exists push_notification_log_category_check;

alter table public.push_notification_log
  add constraint push_notification_log_category_check
  check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm'));
