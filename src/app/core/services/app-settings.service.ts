import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function legacyKeyStorage(userId: string): string {
  return `rupa:${userId}:openrouter_api_key`;
}

/**
 * The AI provider row in `app_settings`.
 *
 * The integration is provider-agnostic: key, endpoint, model and extra
 * headers all come from these columns (migrations 0022/0023), so switching
 * provider or model is a database update — no code change. NULL/absent
 * columns fall back to the built-in defaults in `bill-scanner.service.ts`.
 */
export interface AppSettings {
  id?: string;
  owner_id?: string;
  /** Column renamed from `openrouter_api_key` in migration 0022. */
  ai_api_key?: string | null;
  /** OpenAI-compatible base URL, e.g. 'https://api.openai.com/v1'. */
  ai_base_url?: string | null;
  /** Provider model id, e.g. 'gemini-3.8-flash'. */
  ai_model?: string | null;
  /** Extra request headers merged over the defaults (migration 0023). */
  ai_headers?: Record<string, string> | null;
}

@Injectable({
  providedIn: 'root',
})
export class AppSettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _aiApiKey = signal<string>('');
  readonly aiApiKey = this._aiApiKey.asReadonly();

  /** Null means "not configured" — consumers use their built-in default. */
  private readonly _aiBaseUrl = signal<string | null>(null);
  readonly aiBaseUrl = this._aiBaseUrl.asReadonly();

  private readonly _aiModel = signal<string | null>(null);
  readonly aiModel = this._aiModel.asReadonly();

  private readonly _aiHeaders = signal<Record<string, string> | null>(null);
  readonly aiHeaders = this._aiHeaders.asReadonly();

  constructor() {
    // Supabase is the source of truth. Legacy localStorage is read only once
    // during the authenticated migration below.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.loadRemoteSettings();
      } else {
        this.reset();
      }
    });
  }

  async loadRemoteSettings(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const { data, error } = await this.supabase.client
      .from('app_settings')
      .select('ai_api_key, ai_base_url, ai_model, ai_headers')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load app settings from Supabase', error);
      return;
    }

    // Provider config applies even when no key is stored yet.
    this.applyAiConfig(data ?? null);

    if (data?.ai_api_key) {
      this.clearLegacyKey(user.id);
      return;
    }

    // Import the key saved by older builds only when the database has no key.
    // The legacy key is removed only after Supabase confirms the upsert.
    const legacyKey = this.getLegacyKey(user.id);
    if (!legacyKey) {
      return;
    }

    const { error: migrationError } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          ai_api_key: legacyKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );

    if (migrationError) {
      console.error('Failed to migrate legacy AI API key to Supabase', migrationError);
      return;
    }

    const verify = await this.supabase.client
      .from('app_settings')
      .select('ai_api_key')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (verify.error || verify.data?.ai_api_key !== legacyKey) {
      console.error('Legacy AI API key migration could not be verified', verify.error);
      return;
    }

    this._aiApiKey.set(legacyKey);
    this.clearLegacyKey(user.id);
  }

  async saveAiApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();

    const user = this.auth.user();
    if (!user) throw new Error('Not signed in.');

    const { error } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          ai_api_key: trimmed || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );
    if (error) {
      throw error;
    }

    this._aiApiKey.set(trimmed);
    this.clearLegacyKey(user.id);
  }

  private applyAiConfig(data: AppSettings | null): void {
    this._aiApiKey.set(data?.ai_api_key ?? '');
    this._aiBaseUrl.set(data?.ai_base_url?.trim() || null);
    this._aiModel.set(data?.ai_model?.trim() || null);

    const headers = data?.ai_headers;
    this._aiHeaders.set(headers && typeof headers === 'object' ? headers : null);
  }

  private reset(): void {
    this._aiApiKey.set('');
    this._aiBaseUrl.set(null);
    this._aiModel.set(null);
    this._aiHeaders.set(null);
  }

  private getLegacyKey(userId: string): string {
    if (typeof localStorage === 'undefined') return '';
    return (
      localStorage.getItem(legacyKeyStorage(userId))?.trim() ||
      localStorage.getItem('openrouter_api_key')?.trim() ||
      ''
    );
  }

  private clearLegacyKey(userId: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(legacyKeyStorage(userId));
    localStorage.removeItem('openrouter_api_key');
  }
}
