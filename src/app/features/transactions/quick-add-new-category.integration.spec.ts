import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { QuickAddSheetComponent } from './quick-add-sheet.component';
import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/http';
import { BillScannerService } from '../../core/services/bill-scanner.service';
import { AiConsentService } from '../../core/services/ai-consent.service';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

const SERVER_CATEGORY_ID = '11111111-2222-3333-4444-555555555555';
const SERVER_TX_ID = '99999999-8888-7777-6666-555555555555';

describe('QuickAddSheet new category (integration with real services)', () => {
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.callFake((url: string, body: any) => {
        if (url === '/categories') {
          return Promise.resolve({ id: SERVER_CATEGORY_ID, owner_id: 'u1', name: body.name, kind: body.kind, created_at: '2026-11-19' });
        }
        if (url === '/transactions') {
          return Promise.resolve({
            id: SERVER_TX_ID,
            owner_id: 'u1',
            occurred_on: '2026-11-19',
            amount: body.amount,
            direction: body.direction,
            category_id: body.category_id ?? null,
            notes: body.notes ?? null,
            source: body.source ?? 'manual',
            source_ref_id: null,
            payment_mode: body.payment_mode,
            bank_account_id: body.bank_account_id ?? null,
            created_at: '2026-11-19T00:00:00.000Z',
          });
        }
        return Promise.resolve({});
      }),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      imports: [QuickAddSheetComponent],
      providers: [
        QuickAddSheetComponent,
        { provide: ApiService, useValue: mockApi },
        { provide: AuthService, useValue: { isAuthenticated: signal(true), user: signal({ id: 'u1' }) } },
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

    expect(mockApi.post).toHaveBeenCalledWith('/categories', jasmine.objectContaining({
      name: 'Coffee',
      kind: 'expense',
    }));
    expect(mockApi.post).toHaveBeenCalledWith('/transactions', jasmine.objectContaining({
      category_id: SERVER_CATEGORY_ID,
    }));
  });

  it('maps an existing category id through to the transaction unchanged', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);

    comp.amount.set(100);
    comp.selectedCategoryId.set('cat-existing');

    await comp.save();

    expect(mockApi.post).toHaveBeenCalledWith('/transactions', jasmine.objectContaining({
      category_id: 'cat-existing',
    }));
  });
});
