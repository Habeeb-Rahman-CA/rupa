import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App, DEV_CLEANUP_MARKER_TTL_MS, isDevCleanupMarkerFresh } from './app';

describe('App', () => {
  beforeEach(async () => {
    // Removed by the tests: the boot splash lives on index.html but the
    // test harness doesn't render it. hideSplash() will safely no-op.
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('dev service-worker cleanup marker', () => {
  const now = 1_700_000_000_000;

  it('is fresh immediately after being written', () => {
    expect(isDevCleanupMarkerFresh(String(now), now)).toBeTrue();
  });

  it('is fresh within the TTL window', () => {
    expect(isDevCleanupMarkerFresh(String(now - DEV_CLEANUP_MARKER_TTL_MS + 1), now)).toBeTrue();
  });

  it('expires once the TTL has elapsed', () => {
    expect(isDevCleanupMarkerFresh(String(now - DEV_CLEANUP_MARKER_TTL_MS), now)).toBeFalse();
    expect(isDevCleanupMarkerFresh(String(now - DEV_CLEANUP_MARKER_TTL_MS - 1), now)).toBeFalse();
  });

  it('treats an absent marker as stale', () => {
    expect(isDevCleanupMarkerFresh(null, now)).toBeFalse();
  });

  it('treats the legacy bare "true" value as stale so it cannot persist forever', () => {
    expect(isDevCleanupMarkerFresh('true', now)).toBeFalse();
    expect(isDevCleanupMarkerFresh('', now)).toBeFalse();
    expect(isDevCleanupMarkerFresh('not-a-number', now)).toBeFalse();
  });

  it('treats a far-future timestamp as stale (clock skew / bad data)', () => {
    // Negative age must not read as "fresh forever".
    expect(isDevCleanupMarkerFresh(String(now + 10 * DEV_CLEANUP_MARKER_TTL_MS), now)).toBeFalse();
  });

  it('bounds marker lifetime to the TTL', () => {
    const writtenAt = now;
    // Fresh right up to the boundary, stale the moment it passes.
    expect(isDevCleanupMarkerFresh(String(writtenAt), writtenAt + DEV_CLEANUP_MARKER_TTL_MS - 1)).toBeTrue();
    expect(isDevCleanupMarkerFresh(String(writtenAt), writtenAt + DEV_CLEANUP_MARKER_TTL_MS)).toBeFalse();
  });
});
