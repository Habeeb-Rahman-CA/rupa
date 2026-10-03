import { TestBed } from '@angular/core/testing';
import { TransactionsService } from './transactions.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { CategoriesService } from './categories.service';
import { BankAccountsService } from './bank-accounts.service';
import { signal } from '@angular/core';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let mockSupabase: any;
  let mockAuth: any;
  let mockBankAccountsService: any;
  const isAuthSignal = signal(true);

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'u1' }),
    };

    mockBankAccountsService = {
      primaryAccount: signal(null),
      bankAccounts: signal([{ id: 'bank_1', balance: 500 }]),
      update: jasmine.createSpy().and.resolveTo({ id: 'bank_1', balance: 600 }),
    };

    const mockQueryBuilder = {
      select: jasmine.createSpy().and.returnThis(),
      insert: jasmine.createSpy().and.returnThis(),
      update: jasmine.createSpy().and.returnThis(),
      delete: jasmine.createSpy().and.returnThis(),
      eq: jasmine.createSpy().and.returnThis(),
      maybeSingle: jasmine.createSpy().and.resolveTo({ data: null, error: null }),
      single: jasmine.createSpy().and.resolveTo({ data: { id: 'tx_1', amount: 100, direction: 'in' }, error: null }),
      order: jasmine.createSpy().and.returnThis(),
      limit: jasmine.createSpy().and.resolveTo({ data: [], error: null }),
    };

    mockSupabase = {
      client: {
        from: jasmine.createSpy().and.returnValue(mockQueryBuilder),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        TransactionsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: CategoriesService, useValue: { categories: signal([]) } },
        { provide: BankAccountsService, useValue: mockBankAccountsService },
      ],
    });

    service = TestBed.inject(TransactionsService);
  });

  it('should identify opening balance by source: opening', async () => {
    mockSupabase.client.from.and.returnValue({
      select: () => ({
        eq: (col: string, val: string) => {
          if (col === 'source' && val === 'opening') {
            return {
              maybeSingle: () => Promise.resolve({ data: { amount: 250, direction: 'in' }, error: null }),
            };
          }
          return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
        },
      }),
    });

    await service.loadOpeningBalance();
    expect(service.openingBalance()).toBe(250);
  });

  it('should await bank accounts update on transaction creation', async () => {
    await service.create({
      amount: 100,
      direction: 'in',
      payment_mode: 'bank',
      bank_account_id: 'bank_1',
    });

    expect(mockBankAccountsService.update).toHaveBeenCalledWith('bank_1', { balance: 600 });
  });
});
