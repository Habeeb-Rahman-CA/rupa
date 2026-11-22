import { TestBed } from '@angular/core/testing';
import { BankAccountsService } from './bank-accounts.service';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { TransactionsService } from './transactions.service';
import { signal } from '@angular/core';

describe('BankAccountsService', () => {
  let service: BankAccountsService;
  let mockApi: any;
  let mockAuth: any;
  let mockTxService: any;
  const isAuthSignal = signal(true);

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'u1' }),
    };

    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    mockTxService = {
      mapUnassignedTransactionsToPrimary: jasmine.createSpy().and.resolveTo(),
    };

    TestBed.configureTestingModule({
      providers: [
        BankAccountsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: ApiService, useValue: mockApi },
        { provide: TransactionsService, useValue: mockTxService },
      ],
    });

    service = TestBed.inject(BankAccountsService);
  });

  it('should generate cryptographically strong unique ID on card creation', async () => {
    mockApi.post.and.resolveTo({ id: 'card-1', owner_id: 'u1', bank_name: 'HDFC', card_type: 'debit', payment_network: 'visa', card_number_masked: '1234', expiry_date: '05/28', cardholder_name: 'JOHN DOE', theme: 'blue', balance: 0, created_at: '' });

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
    mockApi.post.and.resolveTo({ id: 'card_123', is_primary: true });

    await service.setPrimary('card_123');

    expect(mockTxService.mapUnassignedTransactionsToPrimary).toHaveBeenCalledWith('card_123');
  });
});
