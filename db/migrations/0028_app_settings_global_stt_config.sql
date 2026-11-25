-- =============================================================================
-- Migration 0028: Global (shared) STT config row in app_settings
--
-- The speech-to-text provider config added in 0027 (stt_provider / stt_model /
-- stt_base_url / stt_api_key) is supplied by the app and shared by every user,
-- so it lives on a single global row where owner_id IS NULL instead of each
-- user's own row. The per-user Settings UI for STT is removed; users only need
-- read access to that one row.
--
--   * owner_id becomes nullable so the shared row has no owner.
--   * A partial unique index guarantees at most one global row.
--   * RLS: signed-in users may SELECT the global row only. The existing
--     app_settings_owner_all policy (0006) still governs every write:
--     its WITH CHECK (owner_id = auth.uid()) rejects owner_id IS NULL, so
--     users can neither modify nor delete the shared row.
--
-- Populate / update the config from the Supabase dashboard (service role
-- bypasses RLS), e.g.:
--
--   update public.app_settings
--      set stt_api_key  = '<provider key>',
--          stt_provider = 'elevenlabs',      -- optional, default elevenlabs
--          stt_model    = 'scribe_v3',       -- optional, default per provider
--          stt_base_url = null,              -- optional, default per provider
--          updated_at   = now()
--    where owner_id is null;
--
-- Note: the key is plain text (the device-bound vault in the app cannot
-- decrypt ciphertext written from elsewhere); the app reads it as-is.
--
-- reset_user_data (0026) deletes app_settings where owner_id = v_uid, which
-- never matches NULL — user resets leave the shared row untouched.
-- =============================================================================

-- 1. The shared row has no owner.
alter table public.app_settings
  alter column owner_id drop not null;

-- 2. Seed the single global row when it does not exist yet.
insert into public.app_settings (owner_id)
select null::uuid
where not exists (
  select 1 from public.app_settings where owner_id is null
);

-- 3. Enforce "at most one global row".
create unique index if not exists app_settings_one_global_row
  on public.app_settings (
    (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where owner_id is null;

-- 4. Let every signed-in user read the shared row. Writes stay owner-only
--    via app_settings_owner_all (see header).
drop policy if exists app_settings_read_global on public.app_settings;
create policy app_settings_read_global on public.app_settings
  for select to authenticated
  using (owner_id is null);
