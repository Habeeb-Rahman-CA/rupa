import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const LOCAL_KEY_STORAGE = 'rupa_openrouter_api_key';

export interface AppSettings {
  id?: string;
  owner_id?: string;
  openrouter_api_key?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AppSettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _openRouterApiKey = signal<string>('');
  readonly openRouterApiKey = this._openRouterApiKey.asReadonly();

  constructor() {
    // Load from local storage initially for instant access
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(LOCAL_KEY_STORAGE);
      if (cached) {
        this._openRouterApiKey.set(cached);
      }
    }

    // Load from Supabase when user is authenticated
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.loadRemoteSettings();
      }
    });
  }

  async loadRemoteSettings(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('app_settings')
        .select('openrouter_api_key')
        .limit(1);

      if (!error && data && data.length > 0 && data[0].openrouter_api_key) {
        const key = data[0].openrouter_api_key;
        this._openRouterApiKey.set(key);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_KEY_STORAGE, key);
        }
      }
    } catch {
      // Table or remote setting may not exist yet, fallback to local/cached key
    }
  }

  async saveOpenRouterApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    this._openRouterApiKey.set(trimmed);

    if (typeof localStorage !== 'undefined') {
      if (trimmed) {
        localStorage.setItem(LOCAL_KEY_STORAGE, trimmed);
      } else {
        localStorage.removeItem(LOCAL_KEY_STORAGE);
      }
    }

    const user = this.auth.user();
    if (!user) return;

    try {
      await this.supabase.client
        .from('app_settings')
        .upsert(
          {
            owner_id: user.id,
            openrouter_api_key: trimmed || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id' }
        );
    } catch {
      // Remote upsert fallback
    }
  }
}
