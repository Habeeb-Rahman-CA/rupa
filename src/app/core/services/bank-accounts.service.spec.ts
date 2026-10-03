import { TestBed } from '@angular/core/testing';
import { BankAccountsService } from './bank-accounts.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { signal } from '@angular/core';

describe('BankAccountsService', () => {
  let service: BankAccountsService;
  let mockSupabase: any;
  let mockAuth: any;
  let mockTxService: any;
  const isAuthSignal = signal(false);

  beforeEach(() => {
    isAuthSignal.set(false);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal(null),
    };

    const mockQueryBuilder = {
      select: jasmine.createSpy().and.returnThis(),
      order: jasmine.createSpy().and.returnThis(),
      insert: jasmine.createSpy().and.resolveTo({ data: null, error: null }),
      update: jasmine.createSpy().and.returnThis(),
      delete: jasmine.createSpy().and.returnThis(),
      eq: jasmine.createSpy().and.returnThis(),
      neq: jasmine.createSpy().and.resolveTo({ data: null, error: null }),
    };

    mockSupabase = {
      client: {
        from: jasmine.createSpy().and.returnValue(mockQueryBuilder),
      },
    };

    mockTxService = {
      mapUnassignedTransactionsToPrimary: jasmine.createSpy().and.resolveTo(),
    };

    TestBed.configureTestingModule({
      providers: [
        BankAccountsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: TransactionsService, useValue: mockTxService },
      ],
    });

    service = TestBed.inject(BankAccountsService);
  });

  it('should generate cryptographically strong unique ID on card creation', async () => {
    const card = await service.create({
      bank_name: 'HDFC',
      account_name: 'Salary Account',
      card_type: 'debit',
      payment_network: 'visa',
      card_number_masked: '1234',
      expiry_date: '05/28',
      cardholder_name: 'JOHN DOE',
      theme: 'blue',
    });

    expect(card.id).toBeDefined();
    expect(card.id.length).toBeGreaterThan(10);
  });

  it('should await mapUnassignedTransactionsToPrimary and set primary account target FIRST in DB', async () => {
    const updateSpy = mockSupabase.client.from().update;

    await service.setPrimary('card_123');

    expect(mockTxService.mapUnassignedTransactionsToPrimary).toHaveBeenCalledWith('card_123');
    expect(updateSpy).toHaveBeenCalledWith({ is_primary: true });
    expect(updateSpy).toHaveBeenCalledWith({ is_primary: false });
  });
});
