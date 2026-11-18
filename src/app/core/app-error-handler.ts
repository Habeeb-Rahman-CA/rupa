import { ErrorHandler, Injectable } from '@angular/core';

import { getErrorMessage } from '../shared/utils/error-utils';

const OVERLAY_ID = 'app-error-overlay';
const BANNER_ID = 'app-error-banner';
const SPLASH_ID = 'app-splash';

/** Above the boot splash (z-index 9999) so the error screen always wins. */
const OVERLAY_Z_INDEX = 10_000;
const BANNER_Z_INDEX = 9_998;

/** Errors inside this window count toward the crash-loop threshold. */
const ESCALATION_WINDOW_MS = 5_000;
/** This many errors inside the window means the app is thrashing → block. */
const ESCALATION_THRESHOLD = 3;

/**
 * If the very first render threw, Angular may never paint. Give it a moment
 * after the first error, then block if the boot splash is still showing.
 */
const FIRST_PAINT_GRACE_MS = 1_500;

/** Bounded record of recent errors, kept for support/debugging. */
const RECENT_ERRORS_KEY = 'rupa:last_errors';
const MAX_RECENT_ERRORS = 10;

export interface RecordedError {
  at: string;
  message: string;
  stack?: string;
}

// ------------------------------------------------------------ error reporting

/**
 * Append an error to the bounded on-device record (sessionStorage, so it
 * survives the reload the user performs to recover). Never throws — this runs
 * from inside the error handler.
 */
export function recordError(error: unknown): void {
  try {
    const message = getErrorMessage(error, String(error));
    const stack =
      error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined;
    const entry: RecordedError = {
      at: new Date().toISOString(),
      message: message.slice(0, 500),
      ...(stack ? { stack: stack.slice(0, 2_000) } : {}),
    };
    const next = [entry, ...getRecentErrors()].slice(0, MAX_RECENT_ERRORS);
    sessionStorage.setItem(RECENT_ERRORS_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode, quota) — reporting is best-effort.
  }
}

/** Most recent errors first. Empty when nothing has been recorded. */
export function getRecentErrors(): RecordedError[] {
  try {
    const raw = sessionStorage.getItem(RECENT_ERRORS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecordedError[]) : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------- recovery

function style(node: HTMLElement, css: string): void {
  node.style.cssText = css;
}

function button(label: string, action: string, primary: boolean): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.dataset['action'] = action;
  style(
    node,
    primary
      ? 'padding:10px 18px;border:none;border-radius:999px;background:var(--app-accent,#0b0d10);' +
          'color:var(--app-ink-inverse,#ffffff);font:inherit;font-size:14px;font-weight:600;cursor:pointer;'
      : 'padding:10px 18px;border:1px solid var(--app-hairline,rgba(0,0,0,.12));border-radius:999px;' +
          'background:transparent;color:var(--app-ink-muted,#6b7280);font:inherit;font-size:14px;cursor:pointer;',
  );
  return node;
}

/**
 * Blocking, full-screen recovery screen. Terminal until the user reloads —
 * used only for a crash loop or a failed bootstrap, never for a one-off error.
 *
 * Built with plain DOM rather than an Angular component on purpose: Angular's
 * renderer is exactly what may be broken when this runs. Idempotent — a second
 * call while one is on screen is a no-op.
 */
export function showFatalError(error: unknown): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(OVERLAY_ID)) return;

  // The splash covers everything and never hides if bootstrap failed.
  document.getElementById(SPLASH_ID)?.remove();
  // A non-blocking banner, if one is up, is superseded by the full screen.
  document.getElementById(BANNER_ID)?.remove();
  document.body.style.overflow = 'hidden';

  const message = getErrorMessage(error);
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'app-error-title');
  style(
    overlay,
    `position:fixed;inset:0;z-index:${OVERLAY_Z_INDEX};display:flex;align-items:center;` +
      'justify-content:center;padding:24px;background:var(--app-canvas,#f5f5f7);font-family:inherit;',
  );

  const card = document.createElement('div');
  style(
    card,
    'width:100%;max-width:420px;background:var(--app-surface,#ffffff);' +
      'border:1px solid var(--app-hairline,rgba(0,0,0,.12));border-radius:20px;padding:24px;' +
      'box-shadow:0 16px 48px rgba(0,0,0,.22);',
  );

  const title = document.createElement('h1');
  title.id = 'app-error-title';
  title.textContent = 'Something went wrong';
  style(
    title,
    'margin:0 0 8px;font-size:20px;font-weight:700;line-height:1.25;' +
      'color:var(--app-ink,#0f1114);',
  );

  const body = document.createElement('p');
  body.textContent =
    'rūpa hit an unexpected error and can’t continue right now. ' +
    'Your saved data is safe — reloading usually fixes it.';
  style(
    body,
    'margin:0 0 16px;font-size:14px;line-height:1.55;color:var(--app-ink-muted,#6b7280);',
  );

  const details = document.createElement('details');
  style(details, 'margin:0 0 20px;font-size:13px;color:var(--app-ink-muted,#6b7280);');
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  style(summary, 'cursor:pointer;user-select:none;');
  const pre = document.createElement('pre');
  pre.textContent = stack ? `${message}\n\n${stack}` : message;
  style(
    pre,
    'margin:8px 0 0;padding:10px;max-height:160px;overflow:auto;white-space:pre-wrap;' +
      'overflow-wrap:anywhere;font-size:11px;line-height:1.45;border-radius:10px;' +
      'background:var(--app-canvas,#f5f5f7);color:var(--app-ink-muted,#6b7280);',
  );
  details.append(summary, pre);

  const actions = document.createElement('div');
  style(actions, 'display:flex;gap:10px;');
  const home = button('Go home', 'home', false);
  const reload = button('Reload', 'reload', true);
  home.addEventListener('click', () => window.location.assign('/'));
  reload.addEventListener('click', () => window.location.reload());
  actions.append(home, reload);

  card.append(title, body, details, actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  reload.focus();
}

/** Log + record + show the blocking screen. Used for bootstrap failures. */
export function handleFatalError(error: unknown): void {
  console.error('[rūpa] Unhandled error:', error);
  recordError(error);
  showFatalError(error);
}

// ------------------------------------------------------------------ boundary

/**
 * Global error boundary.
 *
 * Angular funnels every uncaught error through `ErrorHandler`:
 *  - template, lifecycle and event-handler throws;
 *  - window `error` and `unhandledrejection` (via `provideBrowserGlobalErrorListeners`);
 *  - router navigation failures;
 *  - rejections from fire-and-forget `void …()` calls.
 *
 * The stock handler only logs, so a broken render left a frozen screen — and a
 * failed bootstrap left the user on the splash forever — with no way out. This
 * handler still logs (there is no telemetry backend, so the console is the
 * reporting channel), records the error for support, then surfaces recovery UI.
 *
 * Recovery is tiered so one transient background failure (e.g. a sync that
 * rejects while offline) does not lock the user out of an otherwise healthy
 * app:
 *   - first errors   → a dismissible banner with a Reload action;
 *   - crash loop, or the first paint never completing → blocking error screen.
 */
@Injectable({ providedIn: 'root' })
export class AppErrorHandler implements ErrorHandler {
  private readonly recentErrorTimes: number[] = [];

  handleError(error: unknown): void {
    console.error('[rūpa] Unhandled error:', error);

    try {
      recordError(error);
      this.surface(error);
    } catch (uiError) {
      // The recovery UI must never make the original failure worse.
      console.error('[rūpa] Failed to present recovery UI:', uiError);
    }
  }

  private surface(error: unknown): void {
    const now = Date.now();
    this.recentErrorTimes.push(now);
    while (
      this.recentErrorTimes.length > 0 &&
      now - (this.recentErrorTimes[0] as number) > ESCALATION_WINDOW_MS
    ) {
      this.recentErrorTimes.shift();
    }

    if (this.recentErrorTimes.length >= ESCALATION_THRESHOLD) {
      showFatalError(error);
      return;
    }

    showBanner(error);

    if (this.splashVisible()) {
      // The first render hasn't succeeded yet. If it never does, escalate.
      window.setTimeout(() => {
        if (this.splashVisible()) showFatalError(error);
      }, FIRST_PAINT_GRACE_MS);
    }
  }

  private splashVisible(): boolean {
    const splash = document.getElementById(SPLASH_ID);
    return splash !== null && !splash.classList.contains('splash-hidden');
  }
}

/**
 * Non-blocking notice for a single error: informs without taking the app away.
 * Only one is kept on screen at a time.
 */
function showBanner(error: unknown): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  style(
    banner,
    `position:fixed;left:12px;right:12px;bottom:12px;z-index:${BANNER_Z_INDEX};display:flex;` +
      'gap:12px;align-items:flex-start;padding:12px 14px;background:var(--app-surface,#ffffff);' +
      'border:1px solid var(--app-hairline,rgba(0,0,0,.12));border-radius:14px;' +
      'box-shadow:0 10px 32px rgba(0,0,0,.20);font-family:inherit;',
  );

  const text = document.createElement('div');
  style(text, 'flex:1;min-width:0;');

  const heading = document.createElement('div');
  heading.textContent = 'Something went wrong';
  style(
    heading,
    'font-size:14px;font-weight:600;line-height:1.3;margin-bottom:2px;' +
      'color:var(--app-ink,#0f1114);',
  );

  const detail = document.createElement('div');
  detail.textContent = getErrorMessage(error);
  style(
    detail,
    'font-size:13px;line-height:1.4;color:var(--app-ink-muted,#6b7280);' +
      'overflow-wrap:anywhere;',
  );
  text.append(heading, detail);

  const reload = button('Reload', 'reload', true);
  reload.style.padding = '8px 14px';
  reload.addEventListener('click', () => window.location.reload());

  const dismiss = button('Dismiss', 'dismiss', false);
  dismiss.style.padding = '8px 12px';
  dismiss.setAttribute('aria-label', 'Dismiss error notice');
  dismiss.addEventListener('click', () => banner.remove());

  const actions = document.createElement('div');
  style(actions, 'display:flex;gap:8px;flex:0 0 auto;');
  actions.append(reload, dismiss);

  banner.append(text, actions);
  document.body.appendChild(banner);
}
