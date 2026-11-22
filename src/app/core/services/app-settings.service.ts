import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiKeyVaultService } from './ai-key-vault.service';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { USER_KEYS } from '../config/storage-keys';

export interface AppSettings {
  id?: string;
  owner_id?: string;
  ai_api_key?: string | null;
  ai_base_url?: string | null;
  ai_model?: string | null;
  ai_headers?: Record<string, string> | null;
}

interface AppSettingsResponse {
  ai_api_key: string | null;
  ai_base_url: string | null;
  ai_model: string | null;
  ai_headers: Record<string, string> | null;
}

interface UpdateAppSettingsRequest {
  ai_api_key?: string | null;
  ai_base_url?: string | null;
  ai_model?: string | null;
  ai_headers?: Record<string, string> | null;
}

function legacyKeyStorage(userId: string): string {
  return USER_KEYS.OPENROUTER_API_KEY(userId);
}

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly vault = inject(AiKeyVaultService);

  private readonly _aiApiKey = signal<string>('');
  readonly aiApiKey = this._aiApiKey.asReadonly();

  private readonly _aiBaseUrl = signal<string | null>(null);
  readonly aiBaseUrl = this._aiBaseUrl.asReadonly();

  private readonly _aiModel = signal<string | null>(null);
  readonly aiModel = this._aiModel.asReadonly();

  private readonly _aiHeaders = signal<Record<string, string> | null>(null);
  readonly aiHeaders = this._aiHeaders.asReadonly();

  constructor() {
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

    try {
      const data = await firstValueFrom(
        this.api.get<AppSettingsResponse>('/app-settings'),
      );

      // Decrypt the stored key into memory.
      const storedKey = data.ai_api_key ?? '';
      let plaintextKey = '';
      if (storedKey) {
        try {
          plaintextKey = await this.vault.decrypt(storedKey);
          if (!this.vault.isEncrypted(storedKey)) {
            await this.rewriteEncryptedKey(user.id, plaintextKey);
          }
        } catch (e) {
          console.error('Failed to decrypt stored AI key', e);
          plaintextKey = '';
        }
      }

      this.applyAiConfig(data, plaintextKey);

      if (storedKey) {
        this.clearLegacyKey(user.id);
        return;
      }

      // Import the key saved by older builds only when the database has no key.
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

      try {
        await firstValueFrom(
          this.api.patch('/app-settings', {
            ai_api_key: legacyCipher,
          } as UpdateAppSettingsRequest),
        );
      } catch (e) {
        console.error('Failed to migrate legacy AI API key', e);
        return;
      }

      this._aiApiKey.set(legacyKey);
      this.clearLegacyKey(user.id);
    } catch (error) {
      console.error('Failed to load app settings', error);
    }
  }

  private async rewriteEncryptedKey(ownerId: string, plaintext: string): Promise<void> {
    try {
      const ciphertext = await this.vault.encrypt(plaintext);
      await firstValueFrom(
        this.api.patch('/app-settings', {
          ai_api_key: ciphertext,
        } as UpdateAppSettingsRequest),
      );
    } catch (e) {
      console.error('Failed to re-encrypt stored AI key', e);
    }
  }

  async saveAiApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();

    const user = this.auth.user();
    if (!user) throw new Error('Not signed in.');

    let stored: string | null = null;
    if (trimmed) {
      try {
        stored = await this.vault.encrypt(trimmed);
      } catch (e) {
        console.error('Failed to encrypt AI API key', e);
        throw e;
      }
    }

    try {
      await firstValueFrom(
        this.api.patch('/app-settings', {
          ai_api_key: stored,
        } as UpdateAppSettingsRequest),
      );
    } catch (error) {
      throw error;
    }

    this._aiApiKey.set(trimmed);
    this.clearLegacyKey(user.id);
  }

  private applyAiConfig(data: AppSettingsResponse, plaintextKey: string): void {
    this._aiApiKey.set(plaintextKey);
    this._aiBaseUrl.set(data.ai_base_url?.trim() || null);
    this._aiModel.set(data.ai_model?.trim() || null);

    const headers = data.ai_headers;
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
