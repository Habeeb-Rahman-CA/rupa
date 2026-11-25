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
  /**
   * Speech-to-text provider config — lives on the GLOBAL `app_settings` row
   * (owner_id IS NULL, migration 0028) shared by every user, not on the
   * per-user row. Supplied by the app; there is no per-user UI for it.
   * 'elevenlabs' | 'whisper' | 'openai' | null (null → elevenlabs).
   */
  stt_provider?: string | null;
  /** STT provider model id, e.g. 'scribe_v3', 'whisper-1'. */
  stt_model?: string | null;
  /** STT base url, without trailing path; overrides the provider default. */
  stt_base_url?: string | null;
  /** STT provider key, plain text (see migration 0028). */
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
      .select('ai_api_key, ai_base_url, ai_model, ai_headers')
      .eq('owner_id', user.id)
      .maybeSingle();

    // STT provider config is app-provided and shared: read the single global
    // row (owner_id IS NULL, migration 0028) rather than the user's own row.
    const { data: sttRow, error: sttError } = await this.supabase.client
      .from('app_settings')
      .select('stt_provider, stt_model, stt_base_url, stt_api_key')
      .is('owner_id', null)
      .maybeSingle();
    if (sttError) {
      console.error('Failed to load global STT config from Supabase', sttError);
    }

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
    await this.applyAiConfig(data ?? null, plaintextKey);

    // Shared STT config from the global row applies to every user.
    await this.applySttConfig(sttRow ?? null);

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
   * Push the per-user AI provider config into the signals. `plaintextKey` is
   * the decrypted key (decryption happens in `loadRemoteSettings`) — the raw
   * column value is ciphertext and must never be exposed through `aiApiKey`.
   */
  private applyAiConfig(data: AppSettings | null, plaintextKey: string): void {
    this._aiApiKey.set(plaintextKey);
    this._aiBaseUrl.set(data?.ai_base_url?.trim() || null);
    this._aiModel.set(data?.ai_model?.trim() || null);

    const headers = data?.ai_headers;
    this._aiHeaders.set(headers && typeof headers === 'object' ? headers : null);
  }

  /**
   * Push the SHARED STT provider config (the global `app_settings` row with
   * owner_id IS NULL, migration 0028) into the signals. It is supplied by the
   * app and identical for every user — there is no per-user value or UI.
   *
   * The key is plain text in the database (the device-bound vault cannot
   * decrypt ciphertext written from another device); `decrypt()` passes
   * plaintext through unchanged, so a value that does happen to be `enc:v1:…`
   * ciphertext still works when this device created it.
   */
  private async applySttConfig(
    row: Pick<AppSettings, 'stt_provider' | 'stt_model' | 'stt_base_url' | 'stt_api_key'> | null,
  ): Promise<void> {
    this._sttProvider.set(row?.stt_provider?.trim() || null);
    this._sttModel.set(row?.stt_model?.trim() || null);
    this._sttBaseUrl.set(row?.stt_base_url?.trim() || null);

    const stored = row?.stt_api_key?.trim() ?? '';
    let plaintext = '';
    if (stored) {
      try {
        plaintext = await this.vault.decrypt(stored);
      } catch (e) {
        // Ciphertext from a different device (device-bound vault) — unusable
        // here; leave the key unavailable rather than crash.
        console.error('Failed to read global STT key', e);
        plaintext = '';
      }
    }
    this._sttApiKey.set(plaintext);
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
