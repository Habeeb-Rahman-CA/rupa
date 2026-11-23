import {
  Injectable,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { TIMEOUTS } from '../time/timeouts';
import { DEVICE_KEYS, STORAGE_PREFIX, USER_KEYS } from '../config/storage-keys';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);

  readonly session = this._session.asReadonly();
  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly ready = this._ready.asReadonly();

  /** Resolves once the initial session has been read from persistent storage. */
  readonly whenReady: Promise<void>;

  constructor() {
    this.whenReady = this.supabase.client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to restore Supabase session:', error.message);
          const msg = error.message?.toLowerCase() ?? '';
          const status = error.status;
          const isInvalidRefreshToken =
            (status === 400 || status === 401) &&
            (msg.includes('invalid') ||
              msg.includes('grant') ||
              msg.includes('revoked') ||
              msg.includes('not found') ||
              msg.includes('expired'));

          if (isInvalidRefreshToken) {
            void this.signOut();
          }
        } else {
          this._session.set(data.session);
        }
      })
      .catch((err) => {
        console.error('Failed to restore Supabase session:', err);
      })
      .finally(() => {
        this._ready.set(true);
      });

    // Keep the signal in sync as tokens refresh / user signs in or out.
    const { data: sub } = this.supabase.client.auth.onAuthStateChange(
      (event, session) => {
        this._session.set(session);
        if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
          this._session.set(null);
        }
      },
    );
    this.destroyRef.onDestroy(() => sub.subscription.unsubscribe());

    // ---- PWA session hardening ------------------------------------------
    // When the app comes back to foreground (user opens the PWA after it
    // was backgrounded for hours/days), proactively refresh the session so
    // an expired access token doesn't cause a silent redirect to /login.
    if (typeof document !== 'undefined') {
      const onVisible = (): void => {
        if (document.visibilityState === 'visible' && this._session()) {
          void this.refreshIfPossible();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      });
    }
  }

  /**
   * True when a Supabase 401 is caused by client clock skew: the JWT's `iat`
   * claim is in the future relative to Supabase's server clock. A fresh access
   * token (obtained via refreshSession) will have a correct `iat` and should
   * be accepted.
   */
  isClockSkewError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const status = (error as { status?: number }).status;
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    return (status === 401 || status === 400) && message.includes('issued at future');
  }

  /**
   * If `error` is a clock-skew 401, refresh the session to obtain a new access
   * token with a correct `iat`, then return true so the caller can retry.
   * Returns false for non-clock-skew errors (caller should handle normally).
   */
  async refreshOnClockSkew(error: unknown): Promise<boolean> {
    if (!this.isClockSkewError(error)) return false;
    const currentSession = this._session();
    if (!currentSession) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    try {
      await this.refreshIfPossible();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask Supabase to refresh the access token using the persisted refresh
   * token. If the refresh token itself has expired or is invalid (HTTP 400/401),
   * sign out cleanly so the user can log in again. Transient mobile network
   * disconnects leave the existing session 100% intact.
   */
  async refreshIfPossible(maxAttempts = 2): Promise<void> {
    const currentSession = this._session();
    if (!currentSession) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, error } = await this.supabase.client.auth.refreshSession();
        if (error) {
          const msg = error.message?.toLowerCase() ?? '';
          const status = error.status;

          // Check if error is an explicit invalid/revoked refresh token error
          const isInvalidRefreshToken =
            (status === 400 || status === 401) &&
            (msg.includes('invalid') ||
              msg.includes('grant') ||
              msg.includes('revoked') ||
              msg.includes('not found') ||
              msg.includes('expired'));

          if (isInvalidRefreshToken) {
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, attempt * TIMEOUTS.RETRY_BASE_MS));
              continue;
            }
            console.warn('Session refresh failed with invalid refresh token after retries, logging out:', error.message);
            await this.signOut();
            return;
          } else {
            // Any network, DNS, timeout, or server error leaves existing session intact
            console.warn('Transient session refresh issue, keeping session intact:', error.message);
            return;
          }
        } else if (data?.session) {
          this._session.set(data.session);
          return;
        }
      } catch (err: unknown) {
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          continue;
        }
        console.warn('Transient session refresh network error, keeping session intact:', err);
        return;
      }
    }
  }

  signInWithPassword(email: string, password: string) {
    return this.supabase.client.auth.signInWithPassword({ email, password });
  }

  signUp(email: string, password: string, name?: string) {
    return this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: name ? { name } : undefined,
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
  }

  async signOut(): Promise<void> {
    const userId = this._session()?.user?.id;
    this._session.set(null);
    this.clearUserLocalStorage(userId);
    try {
      await this.supabase.client.auth.signOut();
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
    // Also remove the legacy unscoped keys to avoid cross-user leakage
    try {
      localStorage.removeItem(DEVICE_KEYS.LEGACY_BANK_ACCOUNTS);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_OPENROUTER_API_KEY);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_OPENROUTER_API_KEY);
      localStorage.removeItem(DEVICE_KEYS.LEGACY_DISMISS_BALANCE_BANNER);
    } catch {
      // Ignore
    }
  }

  sendPasswordReset(email: string) {
    return this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
  }

  /**
   * Update the signed-in user's profile: display name (stored in user_metadata.name)
   * and an avatar colour hint (stored in user_metadata.avatar_color).
   */
  async updateProfile(params: {
    displayName: string;
    avatarColor: string;
  }): Promise<{ error: unknown }> {
    const { error } = await this.supabase.client.auth.updateUser({
      data: {
        name: params.displayName,
        avatar_color: params.avatarColor,
      },
    });
    return { error };
  }
}
