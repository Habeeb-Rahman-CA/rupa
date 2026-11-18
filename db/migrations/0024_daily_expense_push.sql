-- =============================================================================
-- Migration 0024: Daily expense push notification category
--
-- Adds 'daily_expense' as a push category so users can opt in/out of the
-- 8 AM daily summary of yesterday's spending.
--
-- The existing cron job (every 15 minutes) invokes the push-notifications
-- Edge Function, which now also checks for yesterday's expense totals and
-- sends one notification per user at 8 AM (IST). De-duplication is handled
-- by push_notification_log with ref 'daily-expense:<YYYY-MM-DD>'.
-- =============================================================================

-- Add 'daily_expense' to the category check constraint on push_preferences
alter table public.push_preferences
  drop constraint if exists push_preferences_category_check;

alter table public.push_preferences
  add constraint push_preferences_category_check
  check (category in ('renewals', 'low_balance', 'budget', 'daily_expense'));

-- Add 'daily_expense' to the category check constraint on push_notification_log
alter table public.push_notification_log
  drop constraint if exists push_notification_log_category_check;

alter table public.push_notification_log
  add constraint push_notification_log_category_check
  check (category in ('renewals', 'low_balance', 'budget', 'daily_expense'));
