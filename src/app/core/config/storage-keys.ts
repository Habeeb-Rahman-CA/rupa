/**
 * Centralized localStorage / sessionStorage key definitions.
 *
 * All storage keys live here so there is a single source of truth for the
 * `rupa:` prefix and every scoped/unscoped key. User-scoped keys are built
 * with `userKey(userId, suffix)` to guarantee consistent formatting across
 * services.
 */

export const STORAGE_PREFIX = 'rupa';

/** Build a user-scoped storage key: `rupa:{userId}:{suffix}`. */
export function userKey(userId: string, suffix: string): string {
  return `${STORAGE_PREFIX}:${userId}:${suffix}`;
}

/**
 * Non-user-scoped (device-level) keys.
 */
export const DEVICE_KEYS = {
  /** AI-scan consent choice (granted/denied/unknown). */
  AI_CONSENT: `${STORAGE_PREFIX}:ai_scan_consent`,
  /** MPIN lock record (salted hash only — never plain PIN). */
  MPIN: `${STORAGE_PREFIX}-mpin`,
  /** Theme preference: light | dark | system. */
  THEME: `${STORAGE_PREFIX}:theme`,
  /** Legacy unscoped AI API key (migrated to user-scoped key below). */
  LEGACY_OPENROUTER_API_KEY: 'openrouter_api_key',
  /** Legacy unscoped bank accounts (migrated to user-scoped key below). */
  LEGACY_BANK_ACCOUNTS: 'rupa_bank_accounts',
  /** Legacy unscoped dismiss balance banner (migrated to user-scoped key below). */
  LEGACY_DISMISS_BALANCE_BANNER: 'rupa_dismiss_balance_banner',
} as const;

/**
 * User-scoped storage key factories.
 */
export const USER_KEYS = {
  /** OpenAI-compatible AI API key (legacy localStorage, migrated to Supabase). */
  OPENROUTER_API_KEY: (userId: string) => userKey(userId, 'openrouter_api_key'),
  /** Bank account cards (legacy localStorage, migrated to Supabase). */
  BANK_ACCOUNTS: (userId: string) => userKey(userId, 'bank_accounts'),
  /** Savings category marker: `true` when a category is marked as savings. */
  SAVINGS_CATEGORY: (userId: string) => userKey(userId, 'savings_cat_'),
  /** Dismissed balance banner flag. */
  DISMISS_BALANCE_BANNER: (userId: string) => userKey(userId, 'dismiss_balance_banner'),
} as const;

/**
 * sessionStorage keys.
 */
export const SESSION_KEYS = {
  /** Dev service-worker removal reload marker (timestamp string). */
  DEV_SERVICE_WORKER_REMOVED: 'rupa_dev_service_worker_removed',
  /** Recent errors record (bounded list of last N errors). */
  RECENT_ERRORS: 'rupa:last_errors',
} as const;
