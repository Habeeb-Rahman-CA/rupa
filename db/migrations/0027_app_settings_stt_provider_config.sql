-- =============================================================================
-- Migration 0027: STT provider config columns on app_settings
--
-- Makes the speech-to-text integration provider-agnostic: the client reads the
-- provider, model, base url and api key from Supabase instead of hardcoding
-- them, so switching STT provider/model is a row update — no code change, no
-- deploy.
--
--   stt_provider   'elevenlabs' | 'whisper' | 'openai' | null (default elevenlabs)
--   stt_model      provider model id, e.g. 'scribe_v3', 'whisper-1'
--   stt_base_url   base url for the active STT provider, without trailing path
--   stt_api_key    the provider key (device-encrypted ciphertext, like ai_api_key)
--
-- All columns are nullable: NULL means "use the app's built-in default"
-- (per-provider: ElevenLabs scribe_v3 / OpenAI whisper-1).
-- =============================================================================

alter table public.app_settings
  add column if not exists stt_provider text,
  add column if not exists stt_model text,
  add column if not exists stt_base_url text,
  add column if not exists stt_api_key text;

-- Allow 'voice' as a transaction source for voice-created entries.
alter table public.transactions
  drop constraint if exists transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'debt', 'opening', 'transfer', 'wallet_recharge', 'wallet_spend', 'subscription', 'voice'));
