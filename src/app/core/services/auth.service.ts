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
      .then(({ data }) => {
        this._session.set(data.session);
      })
      .catch((err) => {
        console.error('Failed to restore Supabase session', err);
      })
      .finally(() => {
        this._ready.set(true);
      });

    // Keep the signal in sync as tokens refresh / user signs in or out.
    const { data: sub } = this.supabase.client.auth.onAuthStateChange(
      (_event, session) => {
        this._session.set(session);
      },
    );
    this.destroyRef.onDestroy(() => sub.subscription.unsubscribe());

    // ---- PWA session hardening ------------------------------------------
    // When the app comes back to foreground (user opens the PWA after it
    // was backgrounded for hours/days), proactively refresh the session so
    // an expired access token doesn't cause a silent redirect to /login.
    if (typeof document !== 'undefined') {
      const onVisible = (): void => {
        if (document.visibilityState === 'visible') {
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
   * token. If the refresh token itself has expired the user will be signed
   * out (session becomes null) and the guard sends them to /login.
   */
  async refreshIfPossible(): Promise<void> {
    try {
      const { error } = await this.supabase.client.auth.refreshSession();
      if (error) {
        // Refresh token expired or revoked — user must sign in again.
        console.warn('Session refresh failed', error.message);
      }
    } catch (err) {
      console.error('Session refresh threw', err);
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

  signOut() {
    return this.supabase.client.auth.signOut();
  }

  sendPasswordReset(email: string) {
    return this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
  }
}
