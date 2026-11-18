import { Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DEVICE_KEYS } from '../config/storage-keys';

/** localStorage key — holds ONLY salted PBKDF2 material, never a plain PIN. */
const STORAGE_KEY = DEVICE_KEYS.MPIN;

/** PBKDF2 cost. 200k SHA-256 iterations is a solid choice for a 4/6-digit PIN. */
const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Wrong attempts before a temporary lockout. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 30_000;
const MAX_LOCKOUT_MS = 300_000;

/** Pages reachable while locked (public routes — no app data behind them). */
const PUBLIC_PATHS = ['/login', '/lock', '/terms'];

/**
 * What is persisted. Contains only:
 *   salt — random per PIN, hash — PBKDF2(salt, PIN). Recovering the PIN from
 *   this is computationally infeasible; nothing here is a PIN value.
 */
interface MpinRecord {
  v: 1;
  salt: string; // base64
  hash: string; // base64
  pinLength: 4 | 6;
  autoLockSeconds: number;
  failedAttempts: number;
  lockUntil: number | null;
  lockoutCount: number;
}

export type MpinVerifyResult = {
  ok: boolean;
  /** Attempts remaining before lockout (0 while locked out / after failure). */
  attemptsLeft: number;
  /** Epoch ms until which the PIN is locked out, or null. */
  lockUntil: number | null;
};

/**
 * App Lock (MPIN) — optional, configured from Settings (disabled by default).
 *
 * Security model:
 *   * the MPIN is NEVER stored or logged — only a PBKDF2-SHA256 hash with a
 *     16-byte random salt (Web Crypto API, requires HTTPS),
 *   * 5 wrong attempts → 30 s lockout, persisted so a refresh cannot bypass it,
 *   * routes behind `mpinGuard` stay unreachable while locked; the lock screen
 *     lives at /lock (outside the shell), so no feature services load while
 *     locked,
 *   * locking happens on fresh launch and when returning from the background
 *     after the configured auto-lock timeout (page visibility API),
 *   * "forgot MPIN" reset is only reachable FROM the lock screen, which
 *     already requires a valid Supabase session (authGuard) — an existing
 *     login is what authorizes the reset.
 */
@Injectable({ providedIn: 'root' })
export class MpinService {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly isConfigured = signal(false);
  readonly isLocked = signal(false);
  readonly pinLength = signal<4 | 6>(4);
  readonly autoLockSeconds = signal(60);
  readonly failedAttempts = signal(0);
  readonly lockUntil = signal<number | null>(null);
  readonly lockoutCount = signal(0);

  readonly attemptsLeft = computed(() => Math.max(0, MAX_ATTEMPTS - this.failedAttempts()));
  readonly isLockingOut = computed(() => {
    const until = this.lockUntil();
    return until !== null && until > Date.now();
  });

  /** Epoch ms when the document went to the background (auto-lock timing). */
  private hiddenAt: number | null = null;
  private visibilityBound = false;

  constructor() {
    this.load();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.onVisibility());
      this.visibilityBound = true;
    }
  }

  // ------------------------------------------------------------- lifecycle

  /** Read the persisted record (refresh / fresh launch). */
  private load(): void {
    const record = readRecord();
    if (!record) return;
    this.isConfigured.set(true);
    this.pinLength.set(record.pinLength);
    this.autoLockSeconds.set(record.autoLockSeconds);
    this.failedAttempts.set(record.failedAttempts);
    this.lockoutCount.set(record.lockoutCount ?? 0);
    // Fresh launch with MPIN on → start locked (unless still cooling down,
    // in which case the lockout continues from where it was left).
    this.lockUntil.set(record.lockUntil);
    this.isLocked.set(true);
  }

  /**
   * Page visibility handler: remember when we went to the background and lock
   * on the way back once the configured timeout has elapsed (0 s = lock as
   * soon as the app is backgrounded and returned to).
   */
  private onVisibility(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      // "Immediately": lock the moment the app goes to the background.
      if (this.isConfigured() && !this.isLocked() && this.autoLockSeconds() === 0) {
        this.lockNow();
      }
      return;
    }
    const hiddenAt = this.hiddenAt;
    this.hiddenAt = null;
    if (!this.isConfigured() || this.isLocked()) return;
    const elapsed = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    if (elapsed >= this.autoLockSeconds() * 1000) {
      this.lockNow();
    }
  }

  // --------------------------------------------------------------- locking

  /**
   * Lock the app: close open dialogs, flip the signal and move to the lock
   * screen (returning to where the user was after unlock). No-op when MPIN is
   * off, already locked, or already on a public page.
   */
  lockNow(): void {
    if (!this.isConfigured() || this.isLocked()) return;
    this.isLocked.set(true);

    const returnUrl = this.router.url.split('?')[0];
    const isPublic = PUBLIC_PATHS.some(
      (path) => returnUrl === path || returnUrl.startsWith(`${path}/`),
    );
    if (isPublic || returnUrl === '/lock') return;

    this.dialog.closeAll();
    void this.router.navigate(['/lock'], { queryParams: { returnUrl } });
  }

  /** Unlock after a successful verify — callers navigate to returnUrl. */
  unlock(): void {
    this.isLocked.set(false);
    this.failedAttempts.set(0);
    this.lockUntil.set(null);
    this.lockoutCount.set(0);
    this.persistAttemptState();
  }

  // -------------------------------------------------------------- verify

  /**
   * Check a PIN against the stored hash. Failure counts up to the lockout;
   * success resets the counter. The PIN is only ever passed to the Web Crypto
   * API — never stored, never logged.
   */
  async verify(pin: string): Promise<MpinVerifyResult> {
    const record = readRecord();
    if (!record) {
      this.isConfigured.set(false);
      return { ok: false, attemptsLeft: MAX_ATTEMPTS, lockUntil: null };
    }

    const now = Date.now();
    if (record.lockUntil !== null && record.lockUntil > now) {
      this.lockUntil.set(record.lockUntil);
      return { ok: false, attemptsLeft: 0, lockUntil: record.lockUntil };
    }

    // If a previous lockout has expired, reset the attempt counter so the user
    // gets a fresh set of attempts after the cool-down period.
    let currentAttempts = record.failedAttempts;
    if (record.lockUntil !== null && record.lockUntil <= now) {
      currentAttempts = 0;
    }

    const expected = base64ToBytes(record.hash);
    const actual = await derivePinHash(pin, base64ToBytes(record.salt));
    const matches = constantTimeEqual(expected, actual);

    if (matches) {
      this.failedAttempts.set(0);
      this.lockUntil.set(null);
      this.lockoutCount.set(0);
      this.persistAttemptState();
      this.isLocked.set(false);
      return { ok: true, attemptsLeft: MAX_ATTEMPTS, lockUntil: null };
    }

    const attempts = currentAttempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Lockout triggered: keep failedAttempts at MAX (never reset to 0),
      // increment lockoutCount, and apply exponential backoff.
      const nextLockoutCount = (record.lockoutCount ?? 0) + 1;
      const lockoutMs = Math.min(
        LOCKOUT_BASE_MS * Math.pow(2, nextLockoutCount - 1),
        MAX_LOCKOUT_MS,
      );
      this.failedAttempts.set(MAX_ATTEMPTS);
      this.lockoutCount.set(nextLockoutCount);
      this.lockUntil.set(now + lockoutMs);
      this.persistAttemptState();
      return { ok: false, attemptsLeft: 0, lockUntil: now + lockoutMs };
    }

    this.failedAttempts.set(attempts);
    this.lockUntil.set(null);
    this.persistAttemptState();

    return {
      ok: false,
      attemptsLeft: MAX_ATTEMPTS - attempts,
      lockUntil: null,
    };
  }

  // -------------------------------------------------------------- setup

  /** Create (or replace) the MPIN: fresh random salt + PBKDF2 hash. */
  async setPin(pin: string): Promise<void> {
    const record = readRecord();
    const salt = randomBytes(SALT_BYTES);
    const hash = await derivePinHash(pin, salt);
    const next: MpinRecord = {
      v: 1,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(hash),
      pinLength: pin.length === 6 ? 6 : 4,
      autoLockSeconds: record?.autoLockSeconds ?? this.autoLockSeconds(),
      failedAttempts: 0,
      lockUntil: null,
      lockoutCount: 0,
    };
    writeRecord(next);
    this.isConfigured.set(true);
    this.pinLength.set(next.pinLength);
    this.failedAttempts.set(0);
    this.lockUntil.set(null);
    this.isLocked.set(false);
  }

  /** Remove the MPIN entirely (caller has already verified the current PIN). */
  disable(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — state below still reflects "off".
    }
    this.isConfigured.set(false);
    this.isLocked.set(false);
    this.failedAttempts.set(0);
    this.lockUntil.set(null);
    this.lockoutCount.set(0);
  }

  /** Persist the auto-lock timeout (seconds: 0 | 60 | 300). */
  setAutoLock(seconds: number): void {
    this.autoLockSeconds.set(seconds);
    const record = readRecord();
    if (record) writeRecord({ ...record, autoLockSeconds: seconds });
  }

  // ------------------------------------------------------------- internals

  /** Persist only the attempt counters (never any PIN-derived material). */
  private persistAttemptState(): void {
    const record = readRecord();
    if (!record) return;
    writeRecord({
      ...record,
      failedAttempts: this.failedAttempts(),
      lockUntil: this.lockUntil(),
    });
  }
}

// --------------------------------------------------------------- crypto

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const subtle = crypto.subtle;
  const key = await subtle.importKey(
    'raw',
    toBuffer(new TextEncoder().encode(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Compare two byte arrays without leaking WHERE they differ. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ------------------------------------------------------------- storage

function readRecord(): MpinRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MpinRecord;
    if (!parsed || parsed.v !== 1 || !parsed.salt || !parsed.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRecord(record: MpinRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}
