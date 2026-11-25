import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { AiKeyVaultService } from './ai-key-vault.service';
import { USER_KEYS, DEVICE_KEYS } from '../config/storage-keys';

function legacyKeyStorage(userId: string): string {
  return USER_KEYS.OPENROUTER_API_KEY(userId);
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
  /** Column renamed from `openrouter_api_key` in migration 0022.
   *  At rest this holds device-encrypted ciphertext (`enc:v1:…`), decrypted
   *  into memory by `AppSettingsService` — never stored as plain text. */
  ai_api_key?: string | null;
  /** OpenAI-compatible base URL, e.g. 'https://api.openai.com/v1'. */
  ai_base_url?: string | null;
  /** Provider model id, e.g. 'gemini-3.8-flash'. */
  ai_model?: string | null;
  /** Extra request headers merged over the defaults (migration 0023). */
  ai_headers?: Record<string, string> | null;
  /** Speech-to-text provider: 'elevenlabs' | 'whisper' | 'openai' | null. */
  stt_provider?: string | null;
  /** STT provider model id, e.g. 'scribe_v3', 'whisper-1'. */
  stt_model?: string | null;
  /** STT base url, without trailing path; overrides the provider default. */
  stt_base_url?: string | null;
  /** STT provider key (device-encrypted ciphertext at rest). */
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
      .select(
        'ai_api_key, ai_base_url, ai_model, ai_headers, stt_provider, stt_model, stt_base_url, stt_api_key',
      )
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load app settings from Supabase', error);
      return;
    }

    // Decrypt the stored key into memory. A plain-text value (legacy row, or
    // a key typed straight into the DB) is transparently re-encrypted back to
    // Supabase below, so at rest the column only ever holds ciphertext.
    const storedKey = data?.ai_api_key ?? '';
    let plaintextKey = '';
    if (storedKey) {
      try {
        plaintextKey = await this.vault.decrypt(storedKey);
        if (!this.vault.isEncrypted(storedKey)) {
          await this.rewriteEncryptedKey(user.id, plaintextKey);
        }
      } catch (e) {
        // Device key missing (e.g. site data cleared) — the ciphertext can't
        // be recovered; leave the key unavailable rather than crash.
        console.error('Failed to decrypt stored AI key', e);
        plaintextKey = '';
      }
    }

    // Provider config applies even when no key is stored yet.
    await this.applyAiConfig(data ?? null, plaintextKey, user.id);

    if (storedKey) {
      this.clearLegacyKey(user.id);
      return;
    }

    // Import the key saved by older builds only when the database has no key.
    // The legacy key is removed only after Supabase confirms the upsert.
    const legacyKey = this.getLegacyKey(user.id);
    if (!legacyKey) {
      return;
    }

    let legacyCipher: string;
    try {
      legacyCipher = await this.vault.encrypt(legacyKey);
    } catch (e) {
      console.error('Failed to encrypt legacy AI API key', e);
      return;
    }

    const { error: migrationError } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          ai_api_key: legacyCipher,
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
    if (verify.error || verify.data?.ai_api_key !== legacyCipher) {
      console.error('Legacy AI API key migration could not be verified', verify.error);
      return;
    }

    this._aiApiKey.set(legacyKey);
    this.clearLegacyKey(user.id);
  }

  /**
   * Re-encrypt a plain-text key found at rest so the column only ever holds
   * ciphertext going forward.
   */
  private async rewriteEncryptedKey(ownerId: string, plaintext: string): Promise<void> {
    try {
      const ciphertext = await this.vault.encrypt(plaintext);
      const { error } = await this.supabase.client
        .from('app_settings')
        .upsert(
          { owner_id: ownerId, ai_api_key: ciphertext, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' },
        );
      if (error) {
        console.error('Failed to re-encrypt stored AI key', error);
      }
    } catch (e) {
      console.error('Failed to re-encrypt stored AI key', e);
    }
  }

  async saveAiApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();

    const user = this.auth.user();
    if (!user) throw new Error('Not signed in.');

    // Encrypt before writing — only ciphertext ever reaches the database.
    // The plaintext lives in the in-memory signal below.
    let stored: string | null = null;
    if (trimmed) {
      try {
        stored = await this.vault.encrypt(trimmed);
      } catch (e) {
        console.error('Failed to encrypt AI API key', e);
        throw e;
      }
    }

    const { error } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          ai_api_key: stored,
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

  /**
   * Re-encrypt a plain-text STT key found at rest so the column only ever holds
   * ciphertext going forward.
   */
  private async rewriteEncryptedSttKey(ownerId: string, plaintext: string): Promise<void> {
    try {
      const ciphertext = await this.vault.encrypt(plaintext);
      const { error } = await this.supabase.client
        .from('app_settings')
        .upsert(
          { owner_id: ownerId, stt_api_key: ciphertext, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' },
        );
      if (error) {
        console.error('Failed to re-encrypt stored STT key', error);
      }
    } catch (e) {
      console.error('Failed to re-encrypt stored STT key', e);
    }
  }

  /**
   * Persists the STT API key (encrypted) plus optional provider config, then
   * updates the in-memory signals. NULL/empty clears the stored key.
   */
  async saveSttConfig({
    provider,
    model,
    baseUrl,
    apiKey,
  }: {
    provider?: string | null;
    model?: string | null;
    baseUrl?: string | null;
    apiKey?: string | null;
  }): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Not signed in.');

    let stored: string | null = null;
    if (apiKey && apiKey.trim()) {
      try {
        stored = await this.vault.encrypt(apiKey.trim());
      } catch (e) {
        console.error('Failed to encrypt STT API key', e);
        throw e;
      }
    }

    const { error } = await this.supabase.client
      .from('app_settings')
      .upsert(
        {
          owner_id: user.id,
          stt_provider: provider ?? null,
          stt_model: model ?? null,
          stt_base_url: baseUrl ?? null,
          stt_api_key: stored,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );
    if (error) {
      throw error;
    }

    this._sttProvider.set(provider?.trim() || null);
    this._sttModel.set(model?.trim() || null);
    this._sttBaseUrl.set(baseUrl?.trim() || null);
    this._sttApiKey.set(apiKey?.trim() || '');
  }

  /**
   * Push provider config into the signals. `plaintextKey` is the decrypted
   * key (decryption happens in `loadRemoteSettings`) — the raw column value
   * is ciphertext and must never be exposed through `aiApiKey`.
   */
  private async applyAiConfig(
    data: AppSettings | null,
    plaintextKey: string,
    ownerId: string,
  ): Promise<void> {
    this._aiApiKey.set(plaintextKey);
    this._aiBaseUrl.set(data?.ai_base_url?.trim() || null);
    this._aiModel.set(data?.ai_model?.trim() || null);

    const headers = data?.ai_headers;
    this._aiHeaders.set(headers && typeof headers === 'object' ? headers : null);

    this._sttProvider.set(data?.stt_provider?.trim() || null);
    this._sttModel.set(data?.stt_model?.trim() || null);
    this._sttBaseUrl.set(data?.stt_base_url?.trim() || null);
    // stt_api_key is ciphertext at rest; decrypt into memory.
    const storedSttKey = data?.stt_api_key ?? '';
    let plaintextSttKey = '';
    if (storedSttKey) {
      try {
        plaintextSttKey = await this.vault.decrypt(storedSttKey);
        if (!this.vault.isEncrypted(storedSttKey)) {
          await this.rewriteEncryptedSttKey(ownerId, plaintextSttKey);
        }
      } catch (e) {
        console.error('Failed to decrypt stored STT key', e);
        plaintextSttKey = '';
      }
    }
    this._sttApiKey.set(plaintextSttKey);
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
