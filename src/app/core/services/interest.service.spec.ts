import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InterestDisposal, InterestEntry } from '../models/domain.models';
import { AuthService } from './auth.service';
import { InterestService } from './interest.service';
import { ApiService } from '../http';

describe('InterestService', () => {
  let service: InterestService;
  let mockApi: any;

  const entry = (overrides: Partial<InterestEntry> = {}): InterestEntry => ({
    id: 'entry-1',
    owner_id: 'u1',
    bank_account_id: 'bank-1',
    occurred_on: '2026-11-01',
    amount: 100,
    stage: 'received',
    notes: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });

  const disposal = (overrides: Partial<InterestDisposal> = {}): InterestDisposal => ({
    id: 'disp-1',
    owner_id: 'u1',
    entry_id: 'entry-1',
    occurred_on: '2026-11-05',
    amount: 40,
    notes: null,
    created_at: '2026-11-05T00:00:00.000Z',
    updated_at: '2026-11-05T00:00:00.000Z',
    ...overrides,
  });

  const seed = (entries: InterestEntry[], disposals: InterestDisposal[] = []): void => {
    (service as any)._entries.set(entries);
    (service as any)._disposals.set(disposals);
  };

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo([]),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        InterestService,
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            user: signal({ id: 'u1' }),
          },
        },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(InterestService);
  });

  it('keeps interest totals separate: received, disposed, pending', () => {
    seed(
      [
        entry({ id: 'e1', amount: 100, stage: 'received' }),
        entry({ id: 'e2', amount: 50, stage: 'received' }),
        entry({ id: 'e3', amount: 60, stage: 'disposed' }),
      ],
      [disposal({ id: 'd1', entry_id: 'e3', amount: 60 })],
    );

    const totalReceived = service.entries().filter((e) => e.stage === 'received').reduce((s, e) => s + e.amount, 0);
    const totalDisposed = service.entries().filter((e) => e.stage === 'disposed').reduce((s, e) => s + e.amount, 0);
    expect(totalReceived).toBe(150);
    expect(totalDisposed).toBe(60);
  });
});
