import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { MpinService } from './mpin.service';

const STORAGE_KEY = 'rupa-mpin';

describe('MpinService', () => {
  let service: MpinService;
  let routerSpy: { url: string; navigate: jasmine.Spy };
  let dialogSpy: { closeAll: jasmine.Spy };

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    routerSpy = {
      url: '/dashboard',
      navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)),
    };
    dialogSpy = { closeAll: jasmine.createSpy('closeAll') };

    TestBed.configureTestingModule({
      providers: [
        MpinService,
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    });
    service = TestBed.inject(MpinService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  /** Simulate a page refresh: a fresh instance reads the same storage. */
  function reinject(): MpinService {
    return TestBed.runInInjectionContext(() => new MpinService());
  }

  // ------------------------------------------------------- default: disabled

  it('is disabled by default (no record → not configured, not locked)', () => {
    expect(service.isConfigured()).toBeFalse();
    expect(service.isLocked()).toBeFalse();
  });

  // ------------------------------------------------------------- setup

  it('setPin() stores only a salted hash — never the PIN itself', async () => {
    await service.setPin('4821');

    expect(service.isConfigured()).toBeTrue();
    expect(service.pinLength()).toBe(4);

    const raw = localStorage.getItem(STORAGE_KEY)!;
    expect(raw).not.toContain('4821'); // no plaintext PIN anywhere
    expect(raw).not.toContain('4821'.split('').join(''));

    const record = JSON.parse(raw) as { salt: string; hash: string; pinLength: number };
    expect(record.salt.length).toBeGreaterThan(10);
    expect(record.hash.length).toBeGreaterThan(10);
    expect(record.pinLength).toBe(4);
    // salt and hash must differ (the hash is salted, not a fixed digest)
    expect(record.hash).not.toBe(record.salt);
  });

  it('records a 6-digit PIN length', async () => {
    await service.setPin('918273');
    expect(service.pinLength()).toBe(6);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pinLength).toBe(6);
  });

  // ------------------------------------------------------------- verify

  it('verify() accepts the correct PIN and unlocks', async () => {
    await service.setPin('1357');
    service.isLocked.set(true);

    const result = await service.verify('1357');

    expect(result.ok).toBeTrue();
    expect(result.attemptsLeft).toBe(5);
    expect(service.isLocked()).toBeFalse();
  });

  it('verify() rejects a wrong PIN and counts down attempts', async () => {
    await service.setPin('1357');

    const result = await service.verify('0000');

    expect(result.ok).toBeFalse();
    expect(result.attemptsLeft).toBe(4);
    expect(result.lockUntil).toBeNull();
    expect(service.isConfigured()).toBeTrue(); // still configured
  });

  it('verify() never logs or returns the PIN', async () => {
    await service.setPin('2468');
    spyOn(console, 'log');
    spyOn(console, 'error');
    spyOn(console, 'warn');

    await service.verify('0000');

    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------- lockout

  it('locks out for 30s after 5 wrong attempts and persists it', async () => {
    await service.setPin('1357');

    let last!: { ok: boolean; lockUntil: number | null; attemptsLeft: number };
    for (let i = 0; i < 5; i++) {
      last = await service.verify('0000');
    }

    expect(last.ok).toBeFalse();
    expect(last.attemptsLeft).toBe(0);
    expect(last.lockUntil).not.toBeNull();
    expect(last.lockUntil! - Date.now()).toBeGreaterThan(20_000);

    // persisted → a refresh cannot bypass the lockout
    const record = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      failedAttempts: number;
      lockUntil: number | null;
    };
    expect(record.lockUntil).not.toBeNull();

    const fresh = reinject();
    expect(fresh.lockUntil()).toBe(last.lockUntil);

    // further attempts during the lockout are refused even for the right PIN
    const blocked = await fresh.verify('1357');
    expect(blocked.ok).toBeFalse();
    expect(blocked.lockUntil).toBe(last.lockUntil);
  });

  it('a successful unlock after lockout expiry resets the counter', async () => {
    await service.setPin('1357');
    for (let i = 0; i < 5; i++) await service.verify('0000');

    // jump past the 30s lockout
    const record = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      lockUntil: number | null;
    };
    record.lockUntil = Date.now() - 1000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));

    const fresh = reinject();
    const result = await fresh.verify('1357');

    expect(result.ok).toBeTrue();
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      failedAttempts: number;
      lockUntil: number | null;
    };
    expect(after.failedAttempts).toBe(0);
    expect(after.lockUntil).toBeNull();
  });

  // ------------------------------------------------------------- locking

  it('starts locked on a fresh launch when configured', async () => {
    await service.setPin('1357');

    const fresh = reinject();
    expect(fresh.isConfigured()).toBeTrue();
    expect(fresh.isLocked()).toBeTrue();
  });

  it('lockNow() closes dialogs and navigates to /lock with returnUrl', async () => {
    await service.setPin('1357');
    routerSpy.url = '/wallets';

    service.lockNow();

    expect(dialogSpy.closeAll).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/lock'], {
      queryParams: { returnUrl: '/wallets' },
    });
    expect(service.isLocked()).toBeTrue();
  });

  it('lockNow() does nothing on public pages or when already locked', async () => {
    await service.setPin('1357');

    routerSpy.url = '/login';
    service.lockNow();
    expect(routerSpy.navigate).not.toHaveBeenCalled();

    routerSpy.url = '/lock';
    service.lockNow();
    expect(routerSpy.navigate).not.toHaveBeenCalled();

    service.isLocked.set(true);
    routerSpy.url = '/wallets';
    service.lockNow();
    expect(dialogSpy.closeAll).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('lockNow() is a no-op when MPIN is not configured', () => {
    service.lockNow();
    expect(service.isLocked()).toBeFalse();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------ auto-lock

  it('persists the auto-lock timeout across refresh', async () => {
    await service.setPin('1357');
    service.setAutoLock(300);

    const fresh = reinject();
    expect(fresh.autoLockSeconds()).toBe(300);

    fresh.setAutoLock(0);
    expect(reinject().autoLockSeconds()).toBe(0);
  });

  it('keeps the auto-lock timeout when the MPIN is changed', async () => {
    await service.setPin('1357');
    service.setAutoLock(60);
    await service.setPin('7777'); // "change" = setPin again

    const fresh = reinject();
    expect(fresh.autoLockSeconds()).toBe(60);
    expect(await fresh.verify('7777')).toEqual(
      jasmine.objectContaining({ ok: true }),
    );
    expect(await fresh.verify('1357').then((r) => r.ok)).toBeFalse(); // old PIN dead
  });

  // ------------------------------------------------------------- disable

  it('disable() removes the record and unlocks', async () => {
    await service.setPin('1357');
    service.isLocked.set(true);

    service.disable();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.isConfigured()).toBeFalse();
    expect(service.isLocked()).toBeFalse();
  });

  it('after disable, guards see it as off (verify reports unconfigured)', async () => {
    await service.setPin('1357');
    service.disable();

    const fresh = reinject();
    expect(fresh.isConfigured()).toBeFalse();
    expect(fresh.isLocked()).toBeFalse();
    const result = await fresh.verify('1357');
    expect(result.ok).toBeFalse();
  });
});
