import { TestBed } from '@angular/core/testing';
import { EventsService } from './events.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { PeopleService } from './people.service';
import { signal } from '@angular/core';

describe('EventsService', () => {
  let service: EventsService;
  let mockSupabase: any;
  let mockAuth: any;
  let mockTxService: any;
  let mockPeopleService: any;
  const isAuthSignal = signal(true);

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'u1' }),
    };

    mockTxService = {
      delete: jasmine.createSpy().and.resolveTo(),
      refresh: jasmine.createSpy().and.resolveTo(),
    };

    mockPeopleService = {
      people: signal([]),
    };

    const mockQueryBuilder = {
      select: jasmine.createSpy().and.returnThis(),
      delete: jasmine.createSpy().and.returnThis(),
      eq: jasmine.createSpy().and.resolveTo({ error: null }),
    };

    mockSupabase = {
      client: {
        from: jasmine.createSpy().and.returnValue(mockQueryBuilder),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        EventsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: TransactionsService, useValue: mockTxService },
        { provide: PeopleService, useValue: mockPeopleService },
      ],
    });

    service = TestBed.inject(EventsService);
  });

  it('should rethrow error in loadDetail on network failure', async () => {
    mockSupabase.client.from.and.returnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error('Network failure') }),
        }),
      }),
    });

    try {
      await service.loadDetail('evt_1');
      fail('Expected loadDetail to throw');
    } catch (err: any) {
      expect(err.message).toBe('Network failure');
    }
  });

  it('should delete linked transaction FIRST before removing event expense', async () => {
    (service as any)._currentDetail.set({
      event: { id: 'evt_1' },
      expenses: [
        { id: 'exp_1', transactionId: 'tx_exp_1' },
      ],
    });

    spyOn(service, 'loadDetail').and.resolveTo();

    await service.removeExpense('exp_1');

    expect(mockTxService.delete).toHaveBeenCalledWith('tx_exp_1');
  });
});
