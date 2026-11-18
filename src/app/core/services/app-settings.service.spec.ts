import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from './app-settings.service';
import { AiKeyVaultService } from './ai-key-vault.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

interface QueryCall {
  table: string;
  op: string;
  args: unknown[];
}

/** `enc:v1:` prefix produced by the real vault — kept identical here. */
const ENC_PREFIX = 'enc:v1:';
const MOCK_ENC = `${ENC_PREFIX}mock:`;

/**
 * Deterministic stand-in for the real AES vault (no IndexedDB in unit tests).
 * Format-compatible: ciphertext is `enc:v1:mock:<base64 plaintext>`.
 */
const mockVault = {
  isEncrypted: (value: string): boolean => value.startsWith(ENC_PREFIX),
  encrypt: (plaintext: string): Promise<string> =>
    Promise.resolve(`${MOCK_ENC}${btoa(plaintext)}`),
  decrypt: (value: string): Promise<string> => {
    if (value.startsWith(MOCK_ENC)) {
      return Promise.resolve(atob(value.slice(MOCK_ENC.length)));
    }
    // Match the real vault: versioned-but-malformed ciphertext is rejected
    // (the real one throws on an unparseable body / bad base64).
    if (value.startsWith(ENC_PREFIX)) {
      return Promise.reject(new Error('Malformed encrypted value.'));
    }
    return Promise.resolve(value);
  },
};

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let queryCalls: QueryCall[];
  /** Queued results per table — consumed in order, last one repeats. */
  let tableResults: Record<string, Array<{ data?: unknown; error?: unknown }>>;

  function makeQuery(table: string) {
    const q: any = {};
    const resolve = () => {
      const queue = tableResults[table] ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve(next ?? { data: null, error: null });
    };
    const ops = [
      'select', 'eq', 'in', 'insert', 'upsert', 'delete',
      'update', 'lt', 'gt', 'gte', 'maybeSingle', 'single',
    ];
    for (const op of ops) {
      q[op] = (...args: unknown[]) => {
        queryCalls.push({ table, op, args });
        return q;
      };
    }
    q.then = (onFulfilled: any, onRejected: any) =>
      resolve().then(onFulfilled, onRejected);
    return q;
  }

  /** The payload of the n-th `upsert` call (default: the first). */
  function upsertPayload(index = 0): Record<string, unknown> {
    const calls = queryCalls.filter((c) => c.op === 'upsert');
    return calls[index]?.args[0] as Record<string, unknown>;
  }

  beforeEach(() => {
    localStorage.removeItem('openrouter_api_key');
    localStorage.removeItem('rupa:u1:openrouter_api_key');

    queryCalls = [];
    tableResults = {};
    const mockSupabase = {
      client: {
        from: jasmine.createSpy('from').and.callFake((table: string) => makeQuery(table)),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        {
          provide: AuthService,
          // isAuthenticated stays false so the constructor effect only
          // resets — tests drive loadRemoteSettings() explicitly.
          useValue: { user: signal({ id: 'u1' }), isAuthenticated: signal(false) },
        },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: AiKeyVaultService, useValue: mockVault },
      ],
    });

    service = TestBed.inject(AppSettingsService);
  });

  afterEach(() => {
    localStorage.removeItem('openrouter_api_key');
    localStorage.removeItem('rupa:u1:openrouter_api_key');
  });

  // ------------------------------------------------------------ load / decrypt

  it('decrypts the stored key into memory and never exposes ciphertext', async () => {
    const ciphertext = await mockVault.encrypt('sk-decrypted');
    tableResults['app_settings'] = [
      {
        data: {
          ai_api_key: ciphertext,
          ai_base_url: 'https://api.example.com/v1',
          ai_model: 'my-model',
          ai_headers: null,
        },
        error: null,
      },
    ];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('sk-decrypted');
    expect(service.aiBaseUrl()).toBe('https://api.example.com/v1');
    expect(service.aiModel()).toBe('my-model');
    // Already ciphertext — no rewrite upsert should happen.
    expect(queryCalls.filter((c) => c.op === 'upsert')).toHaveSize(0);
  });

  it('re-encrypts a plain-text key found at rest (self-heal)', async () => {
    tableResults['app_settings'] = [{ data: { ai_api_key: 'sk-plain-at-rest' }, error: null }];

    await service.loadRemoteSettings();

    // In memory: plaintext, usable for scanning.
    expect(service.aiApiKey()).toBe('sk-plain-at-rest');
    // At rest: rewritten as ciphertext, never the raw key.
    const payload = upsertPayload();
    expect(payload['ai_api_key']).toBe(`${MOCK_ENC}${btoa('sk-plain-at-rest')}`);
    expect(payload['ai_api_key']).not.toBe('sk-plain-at-rest');
  });

  it('leaves the key empty when decryption fails (device key lost)', async () => {
    spyOn(console, 'error');
    tableResults['app_settings'] = [{ data: { ai_api_key: `${ENC_PREFIX}unreadable` }, error: null }];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('');
  });

  // -------------------------------------------------------------- save (encrypt)

  it('encrypts the key before upserting it', async () => {
    await service.saveAiApiKey('  sk-to-store  ');

    const payload = upsertPayload();
    expect(payload['owner_id']).toBe('u1');
    expect(payload['ai_api_key']).toBe(`${MOCK_ENC}${btoa('sk-to-store')}`);
    expect(payload['ai_api_key']).not.toContain('sk-to-store');
    // Plaintext lives only in memory.
    expect(service.aiApiKey()).toBe('sk-to-store');
  });

  it('stores null (not an empty ciphertext) when clearing the key', async () => {
    await service.saveAiApiKey('   ');

    expect(upsertPayload()['ai_api_key']).toBeNull();
    expect(service.aiApiKey()).toBe('');
  });

  it('rejects when not signed in', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        { provide: AuthService, useValue: { user: signal(null), isAuthenticated: signal(false) } },
        { provide: SupabaseService, useValue: { client: {} } },
        { provide: AiKeyVaultService, useValue: mockVault },
      ],
    });
    const signedOut = TestBed.inject(AppSettingsService);

    await expectAsync(signedOut.saveAiApiKey('sk-x')).toBeRejected();
  });

  // ------------------------------------------------------- legacy localStorage

  it('migrates a legacy localStorage key as ciphertext and clears it', async () => {
    localStorage.setItem('rupa:u1:openrouter_api_key', 'sk-legacy-local');
    // 1st select: no DB key. Upsert: ack. 2nd select: verification reads back
    // exactly what was written.
    const written = await mockVault.encrypt('sk-legacy-local');
    tableResults['app_settings'] = [
      { data: null, error: null },
      { data: { ai_api_key: written }, error: null },
    ];

    await service.loadRemoteSettings();

    expect(upsertPayload()['ai_api_key']).toBe(written);
    expect(upsertPayload()['ai_api_key']).not.toContain('sk-legacy-local');
    expect(service.aiApiKey()).toBe('sk-legacy-local');
    expect(localStorage.getItem('rupa:u1:openrouter_api_key')).toBeNull();
    expect(localStorage.getItem('openrouter_api_key')).toBeNull();
  });

  it('keeps the legacy key in localStorage when verification fails', async () => {
    spyOn(console, 'error');
    localStorage.setItem('rupa:u1:openrouter_api_key', 'sk-legacy-local');
    tableResults['app_settings'] = [
      { data: null, error: null },
      { data: { ai_api_key: 'someone-elses-value' }, error: null },
    ];

    await service.loadRemoteSettings();

    expect(localStorage.getItem('rupa:u1:openrouter_api_key')).toBe('sk-legacy-local');
    expect(service.aiApiKey()).toBe('');
  });
});
