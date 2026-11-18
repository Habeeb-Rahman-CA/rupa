import { TestBed } from '@angular/core/testing';

import {
  AppErrorHandler,
  getRecentErrors,
  handleFatalError,
  recordError,
} from './app-error-handler';

const OVERLAY_ID = 'app-error-overlay';
const BANNER_ID = 'app-error-banner';

describe('AppErrorHandler', () => {
  let handler: AppErrorHandler;
  let consoleError: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    handler = TestBed.inject(AppErrorHandler);
    consoleError = spyOn(console, 'error');
    sessionStorage.removeItem('rupa:last_errors');
  });

  afterEach(() => {
    // Recovery UI is appended to <body>; clear it so it can't leak into
    // other specs or cover their elements.
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(BANNER_ID)?.remove();
    document.body.style.overflow = '';
    sessionStorage.removeItem('rupa:last_errors');
  });

  // ------------------------------------------------------------- reporting

  it('logs every error to the console', () => {
    handler.handleError(new Error('boom'));
    expect(consoleError).toHaveBeenCalled();
  });

  it('never throws from the handler itself', () => {
    // recordError/surface are wrapped; even a hostile input must be safe.
    expect(() => handler.handleError(undefined)).not.toThrow();
    expect(() => handler.handleError({ weird: true })).not.toThrow();
  });

  // ------------------------------------------------------------ first error

  it('shows a dismissible banner (not a blocking screen) for a single error', () => {
    handler.handleError(new Error('transient failure'));

    expect(document.getElementById(BANNER_ID)).not.toBeNull();
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });

  it('keeps only one banner on screen', () => {
    handler.handleError(new Error('one'));
    handler.handleError(new Error('two'));

    expect(document.querySelectorAll(`#${BANNER_ID}`)).toHaveSize(1);
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });

  it('dismisses the banner on demand', () => {
    handler.handleError(new Error('boom'));
    const dismiss = document.querySelector<HTMLButtonElement>(
      `#${BANNER_ID} [data-action="dismiss"]`,
    );
    expect(dismiss).not.toBeNull();

    dismiss!.click();

    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  // ------------------------------------------------------------ crash loop

  it('escalates to the blocking error screen on a crash loop', () => {
    handler.handleError(new Error('one'));
    handler.handleError(new Error('two'));
    handler.handleError(new Error('three'));

    expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
    // The banner is superseded once we block.
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('blocks below the threshold (two errors stay non-blocking)', () => {
    handler.handleError(new Error('one'));
    handler.handleError(new Error('two'));

    expect(document.getElementById(OVERLAY_ID)).toBeNull();
    expect(document.getElementById(BANNER_ID)).not.toBeNull();
  });

  // --------------------------------------------------------- fatal screen

  it('renders an accessible recovery screen with working actions', () => {
    handleFatalError(new Error('bootstrap failed'));

    const overlay = document.getElementById(OVERLAY_ID);
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute('role')).toBe('alertdialog');
    expect(overlay!.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector(`#${OVERLAY_ID} h1`)!.textContent).toBe('Something went wrong');
    expect(document.querySelector(`#${OVERLAY_ID} [data-action="reload"]`)).not.toBeNull();
    expect(document.querySelector(`#${OVERLAY_ID} [data-action="home"]`)).not.toBeNull();
  });

  it('shows the technical details for support', () => {
    handleFatalError(new Error('cannot read properties of undefined'));

    const pre = document.querySelector(`#${OVERLAY_ID} pre`);
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('cannot read properties of undefined');
  });

  it('is idempotent — repeated fatals do not stack overlays', () => {
    handleFatalError(new Error('a'));
    handleFatalError(new Error('b'));

    expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveSize(1);
  });

  it('removes a stuck boot splash so it cannot cover the error screen', () => {
    const splash = document.createElement('div');
    splash.id = 'app-splash';
    document.body.appendChild(splash);

    handleFatalError(new Error('bootstrap failed'));

    expect(document.getElementById('app-splash')).toBeNull();
    expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
  });

  // --------------------------------------------------------- error record

  it('records errors with a timestamp for later inspection', () => {
    recordError(new Error('first failure'));

    const recent = getRecentErrors();
    expect(recent).toHaveSize(1);
    expect(recent[0]!.message).toContain('first failure');
    expect(recent[0]!.at).toBeTruthy();
  });

  it('bounds the record to the 10 most recent errors', () => {
    for (let i = 0; i < 25; i++) recordError(new Error(`err ${i}`));

    const recent = getRecentErrors();
    expect(recent).toHaveSize(10);
    expect(recent[0]!.message).toContain('err 24');
    expect(recent[9]!.message).toContain('err 15');
  });

  it('records errors through handleError too', () => {
    handler.handleError(new Error('captured by boundary'));
    expect(getRecentErrors()[0]!.message).toContain('captured by boundary');
  });

  it('returns an empty record when storage holds nothing usable', () => {
    sessionStorage.setItem('rupa:last_errors', 'not json');
    expect(getRecentErrors()).toEqual([]);
  });
});
