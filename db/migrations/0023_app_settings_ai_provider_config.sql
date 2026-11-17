-- =============================================================================
-- Migration 0023: AI provider config columns on app_settings
--
-- Makes the AI integration provider-agnostic: the client reads the provider
-- endpoint, model and extra headers from Supabase instead of hardcoding them,
-- so switching provider/model is a row update — no code change, no deploy.
--
--   ai_api_key   the provider key (exists since 0022: renamed from
--                openrouter_api_key)
--   ai_base_url  OpenAI-compatible BASE url, without the trailing path, e.g.
--                  'https://generativelanguage.googleapis.com/v1beta/openai'
--                  'https://api.openai.com/v1'
--                  'https://openrouter.ai/api/v1'
--                The app always POSTs to {ai_base_url}/chat/completions, so
--                any OpenAI-compatible provider works.
--   ai_model     provider model id, e.g. 'gemini-3.8-flash', 'gpt-4o-mini'
--   ai_headers   jsonb map of EXTRA request headers merged over the defaults,
--                e.g. {"x-api-key": "..."} — lets a provider that authenticates
--                differently override Authorization if needed.
--
-- All columns are nullable: NULL means "use the app's built-in default"
-- (currently the Gemini values in bill-scanner.service.ts).
-- =============================================================================

alter table public.app_settings
  add column if not exists ai_base_url text,
  add column if not exists ai_model text,
  add column if not exists ai_headers jsonb;
