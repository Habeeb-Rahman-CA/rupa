/**
 * Centralized snackbar/duration constants.
 *
 * All `MatSnackBar` duration values across the app are defined here so a
 * single change propagates everywhere instead of editing dozens of
 * `{ duration: N }` literals.
 */

export const SNACKBAR_DURATION = {
  /** Short-lived success / info toasts. */
  SHORT: 2000,
  /** Medium info messages. */
  MEDIUM: 2500,
  /** Standard user feedback. */
  DEFAULT: 3000,
  /** Longer informational messages. */
  LONG: 3500,
  /** Error messages that need to be read. */
  ERROR: 4000,
  /** Critical errors / failed operations. */
  CRITICAL: 4500,
  /** PWA update notifications. */
  PWA_UPDATE: 5000,
} as const;
