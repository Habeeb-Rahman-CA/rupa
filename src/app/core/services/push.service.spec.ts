import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';

import { AuthService } from './auth.service';
import { PushService } from './push.service';
import { ApiService } from '../http/api.service';

describe('PushService', () => {
  let service: PushService;
  let mockApi: any;
  let swPushMock: { isEnabled: boolean };

  const fakeSubscription = {
    endpoint: 'https://push.example.com/abc',
    toJSON: () => ({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }),
    unsubscribe: () => Promise.resolve(true),
  };

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };
    swPushMock = { isEnabled: true };

    TestBed.configureTestingModule({
      providers: [
        PushService,
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
        { provide: ApiService, useValue: mockApi },
        { provide: SwPush, useValue: swPushMock },
      ],
    });

    service = TestBed.inject(PushService);
  });

  it('starts with both categories enabled (opt-out model)', () => {
    expect(service.isCategoryEnabled('renewals')).toBeTrue();
    expect(service.isCategoryEnabled('low_balance')).toBeTrue();
  });

  it('sendTest() calls the API', async () => {
    mockApi.post.and.resolveTo({ mode: 'test', devices: 1, sent: 1 });

    await service.sendTest();

    expect(mockApi.post).toHaveBeenCalledWith('/push/test', {});
  });
});
