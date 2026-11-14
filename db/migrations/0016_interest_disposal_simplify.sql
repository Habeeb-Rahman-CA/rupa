-- =============================================================================
-- Migration 0016: simplify interest disposals
--
-- 1. The app stopped collecting "Recipient" and "Purpose" on a disposal — a
--    single optional note is enough. New rows leave both columns NULL; existing
--    values are kept (they are no longer displayed anywhere). The column checks
--    stay: they still reject an EMPTY string, but pass for NULL.
--
-- 2. The per-disposal history section was removed from the UI: an entry card is
--    now the history. Deleting an entry must therefore delete its disposals in
--    one atomic operation → FK switches from RESTRICT to CASCADE.
-- =============================================================================

alter table public.interest_disposals
  alter column recipient drop not null,
  alter column purpose drop not null;

alter table public.interest_disposals
  drop constraint if exists interest_disposals_entry_id_fkey;

alter table public.interest_disposals
  add constraint interest_disposals_entry_id_fkey
  foreign key (entry_id)
  references public.interest_entries(id)
  on delete cascade;
