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
      'select', 'eq', 'is', 'in', 'insert', 'upsert', 'delete',
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

  beforeEach(() => {
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

  // ------------------------------------------------------------ global row

  it('reads config from the global row (owner_id IS NULL), never per-user', async () => {
    tableResults['app_settings'] = [
      { data: { ai_api_key: 'sk-global', stt_api_key: 'stt-global' }, error: null },
    ];

    await service.loadRemoteSettings();

    const isCalls = queryCalls.filter((c) => c.op === 'is');
    expect(isCalls).toHaveSize(1);
    expect(isCalls[0].args).toEqual(['owner_id', null]);
    // No per-user lookup any more.
    expect(queryCalls.filter((c) => c.op === 'eq')).toHaveSize(0);

    expect(service.aiApiKey()).toBe('sk-global');
    expect(service.sttApiKey()).toBe('stt-global');
  });

  it('applies AI and STT provider config from the same row', async () => {
    tableResults['app_settings'] = [
      {
        data: {
          ai_base_url: 'https://ai.example/v1',
          ai_model: 'my-model',
          ai_headers: { 'x-custom': '1' },
          stt_provider: 'whisper',
          stt_model: 'whisper-1',
          stt_base_url: 'https://stt.example/v1',
        },
        error: null,
      },
    ];

    await service.loadRemoteSettings();

    expect(service.aiBaseUrl()).toBe('https://ai.example/v1');
    expect(service.aiModel()).toBe('my-model');
    expect(service.aiHeaders()).toEqual({ 'x-custom': '1' });
    expect(service.sttProvider()).toBe('whisper');
    expect(service.sttModel()).toBe('whisper-1');
    expect(service.sttBaseUrl()).toBe('https://stt.example/v1');
  });

  // ------------------------------------------------------ key handling

  it('decrypts ciphertext written by this device and never exposes it', async () => {
    const ciphertext = await mockVault.encrypt('sk-decrypted');
    tableResults['app_settings'] = [{ data: { ai_api_key: ciphertext }, error: null }];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('sk-decrypted');
    // Read-only: nothing is ever written back.
    expect(queryCalls.filter((c) => c.op === 'upsert')).toHaveSize(0);
    expect(queryCalls.filter((c) => c.op === 'insert')).toHaveSize(0);
  });

  it('uses a plain-text key on the global row as-is (no rewrite)', async () => {
    tableResults['app_settings'] = [{ data: { ai_api_key: 'sk-plain-at-rest' }, error: null }];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('sk-plain-at-rest');
    expect(queryCalls.filter((c) => c.op === 'upsert')).toHaveSize(0);
  });

  it('leaves keys empty when decryption fails (foreign-device ciphertext)', async () => {
    spyOn(console, 'error');
    tableResults['app_settings'] = [
      { data: { ai_api_key: `${ENC_PREFIX}unreadable`, stt_api_key: `${ENC_PREFIX}unreadable` }, error: null },
    ];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('');
    expect(service.sttApiKey()).toBe('');
  });

  // -------------------------------------------------------------- failure

  it('keeps config empty when the query fails', async () => {
    spyOn(console, 'error');
    tableResults['app_settings'] = [{ data: null, error: { message: 'boom' } }];

    await service.loadRemoteSettings();

    expect(service.aiApiKey()).toBe('');
    expect(service.sttApiKey()).toBe('');
  });

  it('queries nothing when signed out', async () => {
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

    await signedOut.loadRemoteSettings();

    expect(queryCalls).toHaveSize(0);
  });
});
