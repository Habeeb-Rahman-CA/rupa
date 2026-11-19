import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { QuickAddSheetComponent } from './quick-add-sheet.component';
import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { BillScannerService } from '../../core/services/bill-scanner.service';
import { AiConsentService } from '../../core/services/ai-consent.service';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

/**
 * Integration: QuickAddSheetComponent + real CategoriesService + real
 * TransactionsService, with only the Supabase client and auth mocked. Verifies a newly entered category is created and its server id is
 * mapped onto the created transaction.
 */
describe('QuickAddSheet new category (integration with real services)', () => {
  let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  let categoryInserts: Array<Record<string, unknown>>;

  const SERVER_CATEGORY_ID = '11111111-2222-3333-4444-555555555555';
  const SERVER_TX_ID = '99999999-8888-7777-6666-555555555555';

  function buildQueryResult(data: unknown) {
    const builder: any = {};
    builder.insert = jasmine.createSpy('insert').and.callFake((payload: unknown) => {
      categoryInserts.push(payload as Record<string, unknown>);
      return builder;
    });
    builder.select = jasmine.createSpy('select').and.returnValue(builder);
    builder.order = jasmine.createSpy('order').and.returnValue(builder);
    builder.single = jasmine.createSpy('single').and.resolveTo({ data, error: null });
    builder.eq = jasmine.createSpy('eq').and.returnValue(builder);
    builder.maybeSingle = jasmine
      .createSpy('maybeSingle')
      .and.resolveTo({ data: null, error: null });
    return builder;
  }

  beforeEach(() => {
    rpcCalls = [];
    categoryInserts = [];

    const categoriesQuery = buildQueryResult({
      id: SERVER_CATEGORY_ID,
      owner_id: 'u1',
      name: 'Coffee',
      kind: 'expense',
      created_at: '2026-11-19',
    });

    const txQuery = buildQueryResult(null);

    const mockSupabase = {
      client: {
        from: jasmine
          .createSpy('from')
          .and.callFake((table: string) => (table === 'categories' ? categoriesQuery : txQuery)),
        rpc: jasmine
          .createSpy('rpc')
          .and.callFake((name: string, args: Record<string, unknown>) => {
            rpcCalls.push({ name, args });
            return Promise.resolve({
              data: [
                {
                  id: SERVER_TX_ID,
                  owner_id: 'u1',
                  occurred_on: '2026-11-19',
                  amount: args['p_amount'],
                  direction: args['p_direction'],
                  category_id: args['p_category_id'] ?? null,
                  notes: args['p_notes'] ?? null,
                  source: args['p_source'] ?? 'manual',
                  source_ref_id: null,
                  payment_mode: args['p_payment_mode'],
                  bank_account_id: args['p_bank_account_id'] ?? null,
                  created_at: '2026-11-19T00:00:00.000Z',
                },
              ],
              error: null,
            });
          }),
      },
    };

    const mockAuth = {
      isAuthenticated: signal(true),
      user: signal({ id: 'u1' }),
      refreshOnClockSkew: jasmine.createSpy('refreshOnClockSkew').and.resolveTo(false),
    };

    TestBed.configureTestingModule({
      imports: [QuickAddSheetComponent],
      providers: [
        QuickAddSheetComponent,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: AuthService, useValue: mockAuth },
        {
          provide: BankAccountsService,
          useValue: { bankAccounts: signal([]), primaryAccount: signal(null) },
        },
        { provide: MatBottomSheetRef, useValue: { dismiss: jasmine.createSpy('dismiss') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: BillScannerService, useValue: {} },
        {
          provide: AiConsentService,
          useValue: { granted: signal(true), grant: () => {}, deny: () => {} },
        },
      ],
    });
  });

  it('creates the new category and maps its server id onto the transaction', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);

    comp.amount.set(250);
    comp.selectedCategoryId.set('__new__');
    comp.newCategoryName.set('Coffee');

    await comp.save();

    // The category insert happened with the entered name and the tx kind.
    expect(categoryInserts.length).toBe(1);
    expect(categoryInserts[0]['name']).toBe('Coffee');
    expect(categoryInserts[0]['kind']).toBe('expense');

    // The transaction RPC received the SERVER id of the created category.
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0]['name']).toBe('create_transaction_with_balance_update');
    expect(rpcCalls[0]['args']['p_category_id']).toBe(SERVER_CATEGORY_ID);
  });

  it('maps an existing category id through to the transaction unchanged', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);

    comp.amount.set(100);
    comp.selectedCategoryId.set('cat-existing');

    await comp.save();

    expect(categoryInserts.length).toBe(0);
    expect(rpcCalls[0]['args']['p_category_id']).toBe('cat-existing');
  });
});
