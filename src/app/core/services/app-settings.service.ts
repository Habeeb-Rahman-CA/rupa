import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { AiKeyVaultService } from './ai-key-vault.service';

/**
 * The provider-config columns of `app_settings`.
 *
 * ALL of these live on the single GLOBAL row (owner_id IS NULL, migration
 * 0028): the app supplies the keys and provider settings and every user
 * reads the same values — there is no per-user config or UI for them.
 *
 * The integration is provider-agnostic: key, endpoint, model and extra
 * headers all come from these columns (migrations 0022/0023), so switching
 * provider or model is a row update — no code change. NULL/absent columns
 * fall back to the built-in defaults in `bill-scanner.service.ts` /
 * `speech-to-text.service.ts`.
 */
export interface AppSettings {
  id?: string;
  owner_id?: string;
  /** AI provider key (bill scan / voice parsing). Plain text on the global
   *  row — the vault's `decrypt()` passes plaintext through; ciphertext
   *  written by another device is unreadable here and treated as missing. */
  ai_api_key?: string | null;
  /** OpenAI-compatible base URL, e.g. 'https://api.openai.com/v1'. */
  ai_base_url?: string | null;
  /** Provider model id, e.g. 'gemini-3.8-flash'. */
  ai_model?: string | null;
  /** Extra request headers merged over the defaults (migration 0023). */
  ai_headers?: Record<string, string> | null;
  /** STT provider: 'elevenlabs' | 'whisper' | 'openai' | null (→ elevenlabs). */
  stt_provider?: string | null;
  /** STT provider model id, e.g. 'scribe_v3', 'whisper-1'. */
  stt_model?: string | null;
  /** STT base url, without trailing path; overrides the provider default. */
  stt_base_url?: string | null;
  /** STT provider key, plain text (same rules as ai_api_key). */
  stt_api_key?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AppSettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly vault = inject(AiKeyVaultService);

  private readonly _aiApiKey = signal<string>('');
  readonly aiApiKey = this._aiApiKey.asReadonly();

  /** Null means "not configured" — consumers use their built-in default. */
  private readonly _aiBaseUrl = signal<string | null>(null);
  readonly aiBaseUrl = this._aiBaseUrl.asReadonly();

  private readonly _aiModel = signal<string | null>(null);
  readonly aiModel = this._aiModel.asReadonly();

  private readonly _aiHeaders = signal<Record<string, string> | null>(null);
  readonly aiHeaders = this._aiHeaders.asReadonly();

  /** Null means "use built-in default". */
  private readonly _sttProvider = signal<string | null>(null);
  readonly sttProvider = this._sttProvider.asReadonly();

  private readonly _sttModel = signal<string | null>(null);
  readonly sttModel = this._sttModel.asReadonly();

  private readonly _sttBaseUrl = signal<string | null>(null);
  readonly sttBaseUrl = this._sttBaseUrl.asReadonly();

  private readonly _sttApiKey = signal<string>('');
  readonly sttApiKey = this._sttApiKey.asReadonly();

  constructor() {
    // Supabase is the source of truth: the shared config row is loaded on
    // sign-in and the signals are cleared on sign-out.
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

    // One query for everything: the shared config row (owner_id IS NULL,
    // migration 0028) that every user reads — AI (bill scan / voice
    // parsing) and STT (voice input) alike. Per-user rows are ignored.
    const { data, error } = await this.supabase.client
      .from('app_settings')
      .select(
        'ai_api_key, ai_base_url, ai_model, ai_headers, stt_provider, stt_model, stt_base_url, stt_api_key',
      )
      .is('owner_id', null)
      .maybeSingle();

    if (error) {
      console.error('Failed to load global app settings from Supabase', error);
      return;
    }

    await this.applyAiConfig(data ?? null);
    await this.applySttConfig(data ?? null);
  }

  /**
   * Push the shared AI provider config (global row) into the signals.
   */
  private async applyAiConfig(
    row: Pick<AppSettings, 'ai_api_key' | 'ai_base_url' | 'ai_model' | 'ai_headers'> | null,
  ): Promise<void> {
    this._aiBaseUrl.set(row?.ai_base_url?.trim() || null);
    this._aiModel.set(row?.ai_model?.trim() || null);

    const headers = row?.ai_headers;
    this._aiHeaders.set(headers && typeof headers === 'object' ? headers : null);

    this._aiApiKey.set(await this.readKey(row?.ai_api_key, 'AI'));
  }

  /**
   * Push the shared STT provider config (global row) into the signals.
   */
  private async applySttConfig(
    row: Pick<AppSettings, 'stt_provider' | 'stt_model' | 'stt_base_url' | 'stt_api_key'> | null,
  ): Promise<void> {
    this._sttProvider.set(row?.stt_provider?.trim() || null);
    this._sttModel.set(row?.stt_model?.trim() || null);
    this._sttBaseUrl.set(row?.stt_base_url?.trim() || null);

    this._sttApiKey.set(await this.readKey(row?.stt_api_key, 'STT'));
  }

  /**
   * Reads a key column of the global row into memory. Plain text passes
   * through the device vault unchanged; `enc:v1:…` ciphertext created by
   * THIS device decrypts; anything unreadable (foreign device ciphertext)
   * degrades to "not configured" instead of crashing.
   */
  private async readKey(stored: string | null | undefined, label: string): Promise<string> {
    const value = stored?.trim() ?? '';
    if (!value) return '';
    try {
      return await this.vault.decrypt(value);
    } catch (e) {
      console.error(`Failed to read global ${label} API key`, e);
      return '';
    }
  }

  private reset(): void {
    this._aiApiKey.set('');
    this._aiBaseUrl.set(null);
    this._aiModel.set(null);
    this._aiHeaders.set(null);
    this._sttProvider.set(null);
    this._sttModel.set(null);
    this._sttBaseUrl.set(null);
    this._sttApiKey.set('');
  }
}
