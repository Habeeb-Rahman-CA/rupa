/**
 * Centralized timeout / interval constants.
 *
 * All `setTimeout`, `setInterval`, and promise-based delay values are defined
 * here so magic numbers don't drift across services.
 */

export const TIMEOUTS = {
  /** HEIC image decode timeout (ms). */
  HEIC_DECODE_MS: 10_000,
  /** Push notification request timeout (ms). */
  PUSH_REQUEST_MS: 30_000,
  /** MPIN auto-lock countdown tick interval (ms). */
  MPIN_COUNTDOWN_INTERVAL_MS: 500,
  /** Pill position animation delay (ms). */
  PILL_ANIMATION_MS: 450,
  /** Base retry backoff (ms) — multiplied by attempt number. */
  RETRY_BASE_MS: 500,
  /** App splash screen minimum hold (ms). */
  SPLASH_HOLD_MS: 900,
  /** App splash screen fade-out duration (ms). */
  SPLASH_FADE_MS: 400,
  /** Dev service-worker cleanup marker TTL (ms). */
  DEV_CLEANUP_MARKER_TTL_MS: 60_000,
} as const;
