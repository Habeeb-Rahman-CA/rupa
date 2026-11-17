-- =============================================================================
-- Migration 0022: Rename app_settings.openrouter_api_key → ai_api_key
--
-- The stored key is still an OpenRouter key today, but the setting is now
-- provider-agnostic in schema so future AI providers can reuse the column.
-- Guarded so it is safe to run more than once.
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'app_settings'
      and column_name  = 'openrouter_api_key'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'app_settings'
      and column_name  = 'ai_api_key'
  ) then
    alter table public.app_settings
      rename column openrouter_api_key to ai_api_key;
  end if;
end $$;
