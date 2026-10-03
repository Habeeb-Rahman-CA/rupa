import { TestBed } from '@angular/core/testing';
import { DebtsService } from './debts.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { signal } from '@angular/core';

describe('DebtsService', () => {
  let service: DebtsService;
  let mockSupabase: any;
  let mockAuth: any;
  let mockTxService: any;
  const isAuthSignal = signal(true);

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'user_1' }),
    };

    mockTxService = {
      create: jasmine.createSpy().and.resolveTo({ id: 'tx_123' }),
      delete: jasmine.createSpy().and.resolveTo(),
      refresh: jasmine.createSpy().and.resolveTo(),
    };

    const mockQueryBuilder = {
      select: jasmine.createSpy().and.returnThis(),
      insert: jasmine.createSpy().and.returnThis(),
      update: jasmine.createSpy().and.returnThis(),
      delete: jasmine.createSpy().and.returnThis(),
      eq: jasmine.createSpy().and.returnThis(),
      single: jasmine.createSpy().and.resolveTo({ data: { id: 'debt_1' }, error: null }),
      order: jasmine.createSpy().and.resolveTo({ data: [], error: null }),
    };

    mockSupabase = {
      client: {
        from: jasmine.createSpy().and.returnValue(mockQueryBuilder),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        DebtsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: TransactionsService, useValue: mockTxService },
      ],
    });

    service = TestBed.inject(DebtsService);
  });

  it('should rollback created debt and transaction if linking source_ref_id fails in create()', async () => {
    // Mock linking error
    let updateCallCount = 0;
    mockSupabase.client.from.and.callFake((table: string) => {
      if (table === 'transactions') {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: new Error('Linking failed') }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'debt_99' }, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    });

    try {
      await service.create({
        person_id: 'p1',
        direction: 'they_owe',
        amount: 50,
      });
      fail('Expected create() to throw');
    } catch (err: any) {
      expect(err.message).toBe('Linking failed');
    }

    expect(mockTxService.delete).toHaveBeenCalledWith('tx_123');
  });

  it('should delete linked transactions prior to deleting debt row in delete()', async () => {
    (service as any)._debts.set([{ id: 'debt_1', principal: 100, outstanding: 100 }]);

    const callOrder: string[] = [];
    mockTxService.delete.and.callFake(async () => {
      callOrder.push('delete_tx');
    });

    mockSupabase.client.from.and.callFake((table: string) => {
      if (table === 'transactions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [{ id: 'tx_link_1' }] }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => {
            callOrder.push('delete_debt');
            return Promise.resolve({ error: null });
          },
        }),
      };
    });

    await service.delete('debt_1');

    expect(callOrder).toEqual(['delete_tx', 'delete_debt']);
  });
});
