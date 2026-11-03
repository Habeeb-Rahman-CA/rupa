-- =============================================================================
-- Migration 0012: Wallet card color themes
-- =============================================================================

alter table public.wallets
  add column if not exists theme text default 'dark';

update public.wallets
set theme = 'dark'
where theme is null;

alter table public.wallets
  alter column theme set default 'dark',
  alter column theme set not null;

alter table public.wallets
  drop constraint if exists wallets_theme_check,
  add constraint wallets_theme_check
    check (theme in ('blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'));
