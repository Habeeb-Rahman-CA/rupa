-- =============================================================================
-- Default owner_id = auth.uid() so client inserts don't need to send it.
-- RLS 'with check (owner_id = auth.uid())' still enforces correctness.
-- =============================================================================

alter table public.categories   alter column owner_id set default auth.uid();
alter table public.people       alter column owner_id set default auth.uid();
alter table public.transactions alter column owner_id set default auth.uid();
alter table public.debts        alter column owner_id set default auth.uid();
alter table public.events       alter column owner_id set default auth.uid();
