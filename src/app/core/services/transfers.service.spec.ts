import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  let service: TransfersService;
  let rpc: jasmine.Spy;
  let accounts: any;
  let transactions: any;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    accounts = {
      bankAccounts: signal([
        { id: 'source', balance: 500, account_name: 'Source account' },
        { id: 'destination', balance: 100, account_name: 'Destination account' },
      ]),
      load: jasmine.createSpy('load').and.resolveTo(),
    };
    transactions = {
      refresh: jasmine.createSpy('refresh').and.resolveTo(),
    };

    TestBed.configureTestingModule({
      providers: [
        TransfersService,
        {
          provide: AuthService,
          useValue: { isAuthenticated: signal(false), user: signal({ id: 'owner' }) },
        },
        { provide: BankAccountsService, useValue: accounts },
        { provide: TransactionsService, useValue: transactions },
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });

    service = TestBed.inject(TransfersService);
  });

  it('rejects transfers to the same account before calling the database', async () => {
    await expectAsync(
      service.create({
        source_account_id: 'source',
        destination_account_id: 'source',
        amount: 50,
      }),
    ).toBeRejectedWithError('Source and destination accounts must be different.');

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects transfers larger than the source balance', async () => {
    await expectAsync(
      service.create({
        source_account_id: 'source',
        destination_account_id: 'destination',
        amount: 500.01,
      }),
    ).toBeRejectedWithError('Insufficient balance in the source account.');

    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates a transfer through the atomic database operation and refreshes both ledgers', async () => {
    rpc.and.resolveTo({
      data: [
        {
          id: 'transfer-1',
          owner_id: 'owner',
          source_account_id: 'source',
          destination_account_id: 'destination',
          amount: 125,
          occurred_on: '2026-11-03',
          notes: 'Move savings',
          debit_transaction_id: 'debit-1',
          credit_transaction_id: 'credit-1',
          created_at: '2026-11-03T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const transfer = await service.create({
      source_account_id: 'source',
      destination_account_id: 'destination',
      amount: 125,
      occurred_on: '2026-11-03',
      notes: 'Move savings',
    });

    expect(transfer.id).toBe('transfer-1');
    expect(rpc).toHaveBeenCalledWith('create_account_transfer', {
      p_source_account_id: 'source',
      p_destination_account_id: 'destination',
      p_amount: 125,
      p_occurred_on: '2026-11-03',
      p_notes: 'Move savings',
    });
    expect(accounts.load).toHaveBeenCalled();
    expect(transactions.refresh).toHaveBeenCalled();
  });
});
