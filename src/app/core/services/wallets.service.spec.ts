import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { CategoriesService } from './categories.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let rpc: jasmine.Spy;
  let from: jasmine.Spy;
  let bankAccounts: any;
  let transactions: any;
  let categories: ReturnType<typeof signal<any[]>>;
  let categoryLoad: jasmine.Spy;
  let categoryCreate: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    from = jasmine.createSpy('from');
    bankAccounts = {
      bankAccounts: signal([{ id: 'bank-1', account_name: 'Main account', balance: 1000 }]),
      primaryAccount: signal({ id: 'bank-1', account_name: 'Main account', balance: 1000 }),
      load: jasmine.createSpy('load').and.resolveTo(),
    };
    transactions = { refresh: jasmine.createSpy('refresh').and.resolveTo() };
    categories = signal([
      { id: 'food', name: 'Food', kind: 'expense' },
      { id: 'wallet-cat', name: 'Wallet spending', kind: 'expense' },
    ]);
    categoryLoad = jasmine.createSpy('load').and.resolveTo();
    categoryCreate = jasmine
      .createSpy('create')
      .and.callFake(async (name: string, kind: string) => {
        const created = { id: 'created-cat', name, kind, owner_id: 'owner' };
        categories.update((list) => [...list, created]);
        return created;
      });

    TestBed.configureTestingModule({
      providers: [
        WalletsService,
        {
          provide: AuthService,
          useValue: { isAuthenticated: signal(false), user: signal({ id: 'owner' }) },
        },
        {
          provide: CategoriesService,
          useValue: {
            categories,
            load: categoryLoad,
            create: categoryCreate,
          },
        },
        { provide: BankAccountsService, useValue: bankAccounts },
        { provide: TransactionsService, useValue: transactions },
        { provide: SupabaseService, useValue: { client: { from, rpc } } },
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

    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates a bank-funded recharge through the atomic wallet operation', async () => {
    rpc.and.resolveTo({
      data: [
        {
          id: 'wallet-tx-1',
          owner_id: 'owner',
          wallet_id: 'wallet-1',
          kind: 'recharge',
          amount: 250,
          occurred_on: '2026-11-03',
          category_id: null,
          funding_mode: 'bank',
          bank_account_id: 'bank-1',
          notes: 'Monthly top-up',
          debit_transaction_id: 'debit-1',
          credit_transaction_id: 'credit-1',
          created_at: '2026-11-03T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const created = await service.createTransaction({
      wallet_id: 'wallet-1',
      kind: 'recharge',
      amount: 250,
      idempotency_key: '11111111-1111-4111-8111-111111111111',
      occurred_on: '2026-11-03',
      funding_mode: 'bank',
      bank_account_id: 'bank-1',
      notes: 'Monthly top-up',
    });

    expect(created.credit_transaction_id).toBe('credit-1');
    expect(rpc).toHaveBeenCalledWith('create_wallet_transaction', {
      p_request_id: '11111111-1111-4111-8111-111111111111',
      p_wallet_id: 'wallet-1',
      p_kind: 'recharge',
      p_amount: 250,
      p_occurred_on: '2026-11-03',
      p_category_id: null,
      p_funding_mode: 'bank',
      p_bank_account_id: 'bank-1',
      p_notes: 'Monthly top-up',
    });
    expect(bankAccounts.load).toHaveBeenCalled();
    expect(transactions.refresh).toHaveBeenCalled();
  });

  it('creates wallet spending as a categorized transaction operation', async () => {
    rpc.and.resolveTo({
      data: [
        {
          id: 'wallet-tx-2',
          owner_id: 'owner',
          wallet_id: 'wallet-1',
          kind: 'spend',
          amount: 40,
          occurred_on: '2026-11-03',
          category_id: 'wallet-cat',
          funding_mode: null,
          bank_account_id: null,
          notes: null,
          debit_transaction_id: 'debit-2',
          credit_transaction_id: null,
          created_at: '2026-11-03T00:00:00.000Z',
        },
      ],
      error: null,
    });

    await service.createTransaction({
      wallet_id: 'wallet-1',
      kind: 'spend',
      amount: 40,
    });

    // Spends must be categorized under the "Wallet spending" category.
    expect(rpc).toHaveBeenCalledWith('create_wallet_transaction', jasmine.objectContaining({
      p_kind: 'spend',
      p_category_id: 'wallet-cat',
      p_funding_mode: null,
      p_bank_account_id: null,
    }));
    expect(categoryCreate).not.toHaveBeenCalled();
  });

  it('creates the Wallet spending category on first use when it is missing', async () => {
    categories.set([{ id: 'food', name: 'Food', kind: 'expense' }]);
    rpc.and.resolveTo({
      data: [
        {
          id: 'wallet-tx-3',
          owner_id: 'owner',
          wallet_id: 'wallet-1',
          kind: 'spend',
          amount: 10,
          occurred_on: '2026-11-11',
          category_id: 'created-cat',
          funding_mode: null,
          bank_account_id: null,
          notes: null,
          debit_transaction_id: 'debit-3',
          credit_transaction_id: null,
          created_at: '2026-11-11T00:00:00.000Z',
        },
      ],
      error: null,
    });

    await service.createTransaction({
      wallet_id: 'wallet-1',
      kind: 'spend',
      amount: 10,
    });

    expect(categoryCreate).toHaveBeenCalledWith('Wallet spending', 'expense');
    expect(rpc).toHaveBeenCalledWith(
      'create_wallet_transaction',
      jasmine.objectContaining({ p_category_id: 'created-cat' }),
    );
  });

  it('still saves a spend with no category if the category cannot be ensured', async () => {
    categories.set([]);
    categoryCreate.and.rejectWith(new Error('duplicate key value'));
    rpc.and.resolveTo({
      data: [
        {
          id: 'wallet-tx-4',
          owner_id: 'owner',
          wallet_id: 'wallet-1',
          kind: 'spend',
          amount: 10,
          occurred_on: '2026-11-11',
          category_id: null,
          funding_mode: null,
          bank_account_id: null,
          notes: null,
          debit_transaction_id: 'debit-4',
          credit_transaction_id: null,
          created_at: '2026-11-11T00:00:00.000Z',
        },
      ],
      error: null,
    });

    await service.createTransaction({
      wallet_id: 'wallet-1',
      kind: 'spend',
      amount: 10,
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_wallet_transaction',
      jasmine.objectContaining({ p_category_id: null }),
    );
  });
});
