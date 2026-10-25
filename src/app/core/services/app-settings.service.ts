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
    // Supabase is the source of truth. Legacy localStorage is read only once
    // during the authenticated migration below.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.loadRemoteSettings();
      } else {
        this._openRouterApiKey.set('');
      }
    });
  }

  async loadRemoteSettings(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const { data, error } = await this.supabase.client
      .from('app_settings')
      .select('openrouter_api_key')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load app settings from Supabase', error);
      return;
    }

    if (data?.openrouter_api_key) {
      this._openRouterApiKey.set(data.openrouter_api_key);
      this.clearLegacyKey();
      return;
    }

    // Import the key saved by older builds only when the database has no key.
    // The legacy key is removed only after Supabase confirms the upsert.
    const legacyKey = this.getLegacyKey();
    if (!legacyKey) {
      this._openRouterApiKey.set('');
      return;
    }

    const { error: migrationError } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          openrouter_api_key: legacyKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );

    if (migrationError) {
      console.error('Failed to migrate OpenRouter API key to Supabase', migrationError);
      return;
    }

    const verify = await this.supabase.client
      .from('app_settings')
      .select('openrouter_api_key')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (verify.error || verify.data?.openrouter_api_key !== legacyKey) {
      console.error('OpenRouter API key migration could not be verified', verify.error);
      return;
    }

    this._openRouterApiKey.set(legacyKey);
    this.clearLegacyKey();
  }

  async saveOpenRouterApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();

    const user = this.auth.user();
    if (!user) throw new Error('Not signed in.');

    const { error } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          openrouter_api_key: trimmed || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );
    if (error) {
      throw error;
    }

    this._openRouterApiKey.set(trimmed);
    this.clearLegacyKey();
  }

  private getLegacyKey(): string {
    if (typeof localStorage === 'undefined') return '';
    return (
      localStorage.getItem(LOCAL_KEY_STORAGE)?.trim() ||
      localStorage.getItem('openrouter_api_key')?.trim() ||
      ''
    );
  }

  private clearLegacyKey(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LOCAL_KEY_STORAGE);
    localStorage.removeItem('openrouter_api_key');
  }
}
