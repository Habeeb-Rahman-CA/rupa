import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { ApiService } from '../http';
import { TransactionsService } from './transactions.service';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  let service: TransfersService;
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
        TransfersService,
        {
          provide: AuthService,
          useValue: { isAuthenticated: signal(false), user: signal({ id: 'owner' }) },
        },
        { provide: BankAccountsService, useValue: { bankAccounts: signal([]), load: jasmine.createSpy().and.resolveTo() } },
        { provide: TransactionsService, useValue: { refresh: jasmine.createSpy().and.resolveTo() } },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(TransfersService);
  });

  it('rejects transfers to the same account before calling the database', async () => {
    await expectAsync(
      service.createTransfer({
        source_account_id: 'source',
        destination_account_id: 'source',
        amount: 50,
      }),
    ).toBeRejectedWithError('Source and destination accounts must be different.');
  });

  it('rejects transfers larger than the source balance', async () => {
    await expectAsync(
      service.createTransfer({
        source_account_id: 'source',
        destination_account_id: 'destination',
        amount: 500.01,
      }),
    ).toBeRejectedWithError('Insufficient balance in the source account.');
  });
});
