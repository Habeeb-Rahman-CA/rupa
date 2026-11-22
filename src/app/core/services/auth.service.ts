import {
  Injectable,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../http/api.service';
import { TIMEOUTS } from '../time/timeouts';
import { DEVICE_KEYS, STORAGE_PREFIX, USER_KEYS } from '../config/storage-keys';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  data: { session?: { user: { id: string } } } | null;
  error: { message?: string } | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _ready = signal(false);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly ready = this._ready.asReadonly();

  /** Resolves once the initial session has been read from the API. */
  readonly whenReady: Promise<void>;

  constructor() {
    this.whenReady = this.init();
  }

  private async init(): Promise<void> {
    try {
      const profile = await firstValueFrom(
        this.api.get<AuthUser>('/auth/me'),
      );
      this._user.set(profile);
    } catch {
      // No valid session — user is not authenticated.
      this._user.set(null);
    } finally {
      this._ready.set(true);
    }
  }

  /**
   * Ask the API to rotate the access token using the persisted refresh cookie.
   * If the refresh token itself has expired or is invalid (HTTP 401), sign out
   * cleanly so the user can log in again. Transient network disconnects leave
   * the existing cookie session intact.
   */
  async refreshIfPossible(maxAttempts = 2): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await firstValueFrom(
          this.api.post<AuthUser>('/auth/refresh', {}),
        );
        // Refresh succeeded — re-read the profile from the now-valid cookie session.
        await this.init();
        return;
      } catch (err: any) {
        const status = err?.status;
        const isInvalidRefreshToken =
          (status === 400 || status === 401);

        if (isInvalidRefreshToken) {
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, attempt * TIMEOUTS.RETRY_BASE_MS));
            continue;
          }
          console.warn('Session refresh failed with invalid refresh token after retries, logging out');
          await this.signOut();
          return;
        } else {
          // Transient error — keep existing cookie session intact.
          console.warn('Transient session refresh issue, keeping session intact:', err);
          return;
        }
      }
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    try {
      const { userId, email: userEmail } = await firstValueFrom(
        this.api.post<{ userId: string; email: string }>('/auth/login', { email, password }),
      );
      this._user.set({ id: userId, email: userEmail });
      this._ready.set(true);
      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? 'Login failed' } };
    }
  }

  async signUp(email: string, password: string, name?: string): Promise<AuthResult> {
    try {
      await firstValueFrom(
        this.api.post('/auth/register', { email, password }),
      );
      // Registration sets auth cookies; fetch profile to populate the user signal.
      await this.init();
      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? 'Signup failed' } };
    }
  }

  async signOut(): Promise<void> {
    const userId = this._user()?.id;
    this._user.set(null);
    this.clearUserLocalStorage(userId);
    try {
      await firstValueFrom(this.api.post('/auth/logout', {}));
    } catch {
      // Ignore network errors on signout
    }
  }

  private clearUserLocalStorage(userId: string | null | undefined): void {
    if (!userId || typeof localStorage === 'undefined') return;
    const prefix = `${STORAGE_PREFIX}:${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore individual removal failures
      }
    }
    try {
      localStorage.removeItem(DEVICE_KEYS.LEGACY_BANK_ACCOUNTS);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_OPENROUTER_API_KEY);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_OPENROUTER_API_KEY);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_DISMISS_BALANCE_BANNER);
    } catch {
      // Ignore
    }
  }

  async sendPasswordReset(email: string): Promise<AuthResult> {
    try {
      console.warn('sendPasswordReset is not yet available via the REST API.');
      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? 'Password reset failed' } };
    }
  }

  /**
   * Kept for API compatibility with callers that check for Supabase clock-skew
   * errors. With HttpOnly cookies + REST, clock skew is handled by the server,
   * so this always returns false.
   */
  isClockSkewError(error: unknown): boolean {
    return false;
  }

  async refreshOnClockSkew(error: unknown): Promise<boolean> {
    return false;
  }
}
