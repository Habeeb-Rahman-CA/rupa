import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { CategoriesService } from './categories.service';
import { ApiService } from '../http';
import { TransactionsService } from './transactions.service';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        WalletsService,
        {
          provide: AuthService,
          useValue: { isAuthenticated: signal(false), user: signal({ id: 'owner' }) },
        },
        {
          provide: CategoriesService,
          useValue: { categories: signal([]), load: jasmine.createSpy().and.resolveTo(), create: jasmine.createSpy().and.resolveTo() },
        },
        { provide: BankAccountsService, useValue: { bankAccounts: signal([]), primaryAccount: signal(null), load: jasmine.createSpy().and.resolveTo(), update: jasmine.createSpy().and.resolveTo() } },
        { provide: TransactionsService, useValue: { refresh: jasmine.createSpy().and.resolveTo() } },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(WalletsService);
    (service as any)._wallets.set([
      {
        id: 'wallet-1',
        owner_id: 'owner',
        name: 'Paytm',
        initial_balance: 100,
        balance: 100,
        minimum_balance: 25,
        created_at: '',
      },
    ]);
  });

  it('rejects wallet spending beyond the current balance before calling the database', async () => {
    await expectAsync(
      service.createTransaction({
        wallet_id: 'wallet-1',
        kind: 'spend',
        amount: 100.01,
      }),
    ).toBeRejectedWithError('Insufficient balance in the wallet.');
  });
});
