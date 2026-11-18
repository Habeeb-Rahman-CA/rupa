/**
 * Centralized color constants.
 *
 * Mirrors the CSS custom properties defined in `src/styles.scss` so TypeScript
 * code (component styles, inline style bindings, canvas/graphics code) can
 * reference the same values without duplicating hex literals. Fallback values
 * match the CSS variable defaults for consistency.
 */

export const APP_COLORS = {
  // ---- Canvas / surface -------------------------------------------------
  canvas: '#f5f5f7',        // --app-canvas
  surface: '#ffffff',       // --app-surface

  // ---- Ink (text) -------------------------------------------------------
  ink: '#0f1114',           // --app-ink
  inkMuted: '#6b7280',      // --app-ink-muted
  inkSubtle: '#9ca3af',     // --app-ink-subtle
  inkInverse: '#ffffff',    // --app-ink-inverse
  inkDark: '#0b0d10',       // --app-ink-dark
  inkDarkSoft: 'rgba(11, 13, 16, 0.06)', // --app-ink-dark-soft

  // ---- Accent -----------------------------------------------------------
  accent: '#0b0d10',        // --app-accent
  accentSoft: 'rgba(11, 13, 16, 0.06)', // --app-accent-soft

  // ---- Semantic money colors -------------------------------------------
  positive: '#16a34a',      // --app-positive
  positiveSoft: 'rgba(22, 163, 74, 0.12)', // --app-positive-soft
  negative: '#ef4444',      // --app-negative
  negativeSoft: 'rgba(239, 68, 68, 0.1)',  // --app-negative-soft
  savings: '#0ea5e9',       // --app-savings
  savingsSoft: 'rgba(14, 165, 233, 0.12)', // --app-savings-soft
  mint: '#16a34a',          // --app-mint
  mintSoft: 'rgba(22, 163, 74, 0.14)',     // --app-mint-soft
  peach: '#ef4444',         // --app-peach
  peachSoft: 'rgba(239, 68, 68, 0.12)',    // --app-peach-soft

  // ---- Warning / alert colors (budgets, over-limit states) -------------
  warning: '#f59e0b',       // amber-500
  warningDark: '#b45309',   // amber-700

  // ---- Hairlines / inputs ----------------------------------------------
  hairline: 'rgba(15, 17, 20, 0.06)', // --app-hairline
  inputBg: '#f2f2f4',       // --app-input-bg

  // ---- Theme accent palette (category card colors) ---------------------
  theme: {
    mint: '#10a37f',
    neon: '#1db954',
    rose: '#fc3c44',
    amber: '#ff6b35',
    scarlet: '#e50914',
    slate: '#94a3b8',
    violet: '#6366f1',
  },

  // ---- Category palette (deterministic hash colors) ---------------------
  category: [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#f59e0b', // amber-500
    '#22c55e', // emerald-500
    '#10b981', // emerald-600
    '#14b8a6', // teal-500
    '#0ea5e9', // sky-500
    '#ec4899', // pink-500
    '#475569', // slate-600
  ],

  // ---- Status / info colors --------------------------------------------
  info: '#3f4bb8',          // indigo-blue used for dev status chips

  // ---- Brand / fallback colors used in inline styles --------------------
  white: '#ffffff',
  black: '#000000',
} as const;

/** Dark theme overrides for colors that change between light/dark. */
export const APP_COLORS_DARK = {
  canvas: '#0b0d10',
  surface: '#14161b',
  ink: '#f5f6f8',
  inkMuted: '#9ca3af',
  inkSubtle: '#6b7280',
  inkInverse: '#0b0d10',
  accent: '#e7e7ea',
  accentSoft: 'rgba(231, 231, 234, 0.08)',
  positive: '#34d399',
  positiveSoft: 'rgba(52, 211, 153, 0.14)',
  negative: '#f87171',
  negativeSoft: 'rgba(248, 113, 113, 0.12)',
  savings: '#60a5fa',
  savingsSoft: 'rgba(96, 165, 250, 0.14)',
  mint: '#34d399',
  mintSoft: 'rgba(52, 211, 153, 0.16)',
  peach: '#f87171',
  peachSoft: 'rgba(248, 113, 113, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.06)',
  inputBg: '#1f2028',
  inkDark: '#e7e7ea',
  inkDarkSoft: 'rgba(231, 231, 234, 0.06)',
} as const;
