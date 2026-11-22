import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from './app-settings.service';
import { AiKeyVaultService } from './ai-key-vault.service';
import { AuthService } from './auth.service';
import { ApiService } from '../http';

const mockVault = {
  isEncrypted: (value: string): boolean => value.startsWith('enc:v1:'),
  encrypt: (plaintext: string): Promise<string> => Promise.resolve(`enc:v1:mock:${btoa(plaintext)}`),
  decrypt: (value: string): Promise<string> => Promise.resolve(value.replace('enc:v1:mock:', atob(value.replace('enc:v1:mock:', '')))),
};

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo({ ai_api_key: null, ai_base_url: null, ai_model: null, ai_headers: null }),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        { provide: AiKeyVaultService, useValue: mockVault },
        { provide: AuthService, useValue: { isAuthenticated: signal(false), user: signal({ id: 'u1' }) } },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(AppSettingsService);
  });

  it('loadRemoteSettings with no stored key returns null defaults', async () => {
    await service.loadRemoteSettings();
    expect(service.aiApiKey()).toBe('');
    expect(service.aiBaseUrl()).toBeNull();
  });
});
