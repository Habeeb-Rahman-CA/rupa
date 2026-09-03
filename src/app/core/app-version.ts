/**
 * Single source of truth for the app version shown in the UI.
 * Bump this together with `package.json` when releasing.
 */
export const APP_VERSION = '1.0.1';

/**
 * A build tag included alongside the version in some diagnostic surfaces
 * (e.g. footer, debug reports). Kept simple — a semver-ish channel.
 */
export const APP_CHANNEL: 'stable' | 'beta' | 'dev' = 'stable';
