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

    const mockQueryBuilder: any = {};
    mockQueryBuilder.select = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.insert = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.update = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.delete = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.eq = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.maybeSingle = jasmine.createSpy().and.resolveTo({ data: null, error: null });
    mockQueryBuilder.single = jasmine.createSpy().and.resolveTo({ data: { id: 'tx_1', amount: 100, direction: 'in' }, error: null });
    mockQueryBuilder.order = jasmine.createSpy().and.returnValue(mockQueryBuilder);
    mockQueryBuilder.limit = jasmine.createSpy().and.resolveTo({ data: [], error: null });

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
        eq: () => ({
          or: () => ({
            order: () => Promise.resolve({
              data: [{ amount: 250, direction: 'in' }],
              error: null,
            }),
          }),
        }),
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

  it('should keep wallet spending under wallet history management', async () => {
    (service as any)._transactions.set([
      {
        id: 'wallet-spend-1',
        owner_id: 'u1',
        occurred_on: '2026-11-03',
        amount: 40,
        direction: 'out',
        category_id: 'food',
        notes: null,
        source: 'wallet_spend',
        source_ref_id: 'wallet-entry-1',
        payment_mode: 'cash',
        bank_account_id: null,
        wallet_id: 'wallet-1',
        created_at: '2026-11-03T00:00:00.000Z',
      },
    ]);

    await expectAsync(service.delete('wallet-spend-1')).toBeRejectedWithError(
      'Linked entries must be managed from their dedicated screen.',
    );
  });
});
