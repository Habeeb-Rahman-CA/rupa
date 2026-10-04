import {
  Injectable,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

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
              await new Promise((resolve) => setTimeout(resolve, attempt * 500));
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
    this._session.set(null);
    try {
      await this.supabase.client.auth.signOut();
    } catch {
      // Ignore network errors on signout
    }
  }

  sendPasswordReset(email: string) {
    return this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
  }
}
