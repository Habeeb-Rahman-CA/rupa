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
          console.warn('Failed to restore Supabase session', error.message);
          void this.signOut();
        } else {
          this._session.set(data.session);
        }
      })
      .catch((err) => {
        console.error('Failed to restore Supabase session', err);
        void this.signOut();
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
   * token. If the refresh token itself has expired or is invalid (HTTP 400),
   * sign out cleanly so the user can log in again.
   */
  async refreshIfPossible(): Promise<void> {
    if (!this._session()) return;
    try {
      const { error } = await this.supabase.client.auth.refreshSession();
      if (error) {
        // Refresh token expired, invalid, or revoked — user must sign in again.
        console.warn('Session refresh failed:', error.message);
        await this.signOut();
      }
    } catch (err) {
      console.error('Session refresh error:', err);
      await this.signOut();
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
