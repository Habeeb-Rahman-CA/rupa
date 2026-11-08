-- =============================================================================
-- Migration 0014: Subscription themes & color presets
-- =============================================================================

alter table public.subscriptions
  add column if not exists theme text default 'slate';

-- Normalize legacy or placeholder values if any
update public.subscriptions
set theme = case
  when theme in ('claude', 'copper') then 'amber'
  when theme in ('chatgpt', 'emerald') then 'mint'
  when theme in ('spotify') then 'neon'
  when theme in ('apple') then 'rose'
  when theme in ('gym', 'sunset') then 'amber'
  when theme in ('netflix', 'youtube') then 'scarlet'
  when theme in ('indigo', 'lavender') then 'violet'
  when theme in ('slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet') then theme
  else 'slate'
end;

alter table public.subscriptions
  alter column theme set default 'slate',
  alter column theme set not null;

alter table public.subscriptions
  drop constraint if exists subscriptions_theme_check,
  add constraint subscriptions_theme_check
    check (theme in (
      'slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'
    ));


