import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ReportsPage } from './reports.page';
import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DebtsService } from '../../core/services/debts.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { SubscriptionsService } from '../../core/services/subscriptions.service';
import { WalletsService } from '../../core/services/wallets.service';
import { MoneyHeldService } from '../../core/services/money-held.service';
import { PeopleService } from '../../core/services/people.service';
import { MatDialog } from '@angular/material/dialog';

describe('ReportsPage savingsCategoryRows', () => {
  let page: ReportsPage;
  let mockTxService: Partial<TransactionsService>;
  let mockCategoriesService: Partial<CategoriesService>;

  const createPage = (txs: any[], cats: any[]) => {
    mockTxService = { transactions: signal(txs) } as unknown as Partial<TransactionsService>;
    mockCategoriesService = { categories: signal(cats) } as unknown as Partial<CategoriesService>;

    TestBed.configureTestingModule({
      imports: [ReportsPage],
      providers: [
        { provide: TransactionsService, useValue: mockTxService },
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: DebtsService, useValue: { theyOweYouTotal: signal(0), youOweTotal: signal(0), openDebts: signal([]) } },
        { provide: BankAccountsService, useValue: { bankAccounts: signal([]), primaryAccount: signal(null) } },
        { provide: SubscriptionsService, useValue: { subscriptions: signal([]), payments: signal([]), statusFor: () => 'active' } },
        { provide: WalletsService, useValue: { wallets: signal([]) } },
        { provide: MoneyHeldService, useValue: { totalHeld: signal(0), peopleCount: signal(0), balances: signal([]) } },
        { provide: PeopleService, useValue: { people: signal([]) } },
        { provide: MatDialog, useValue: { open: () => ({}) } },
      ],
    });

    page = TestBed.inject(ReportsPage);
    return page;
  };

  describe('direction-aware savings calculation', () => {
    it('treats savings outflows as positive and inflows as negative', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
          { amount: 30, direction: 'in', category_id: 'savings-1', occurred_on: '2026-11-15', source: 'manual', notes: null },
        ],
        [{ id: 'savings-1', kind: 'savings', name: 'Emergency Fund', owner_id: 'u1' }],
      );

      const rows = page.savingsCategoryRows();
      expect(rows.length).toBe(1);
      expect(rows[0].amount).toBe(70); // 100 - 30
    });

    it('excludes transfer and wallet_recharge sources', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'transfer', notes: null },
          { amount: 50, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
        ],
        [{ id: 'savings-1', kind: 'savings', name: 'Emergency Fund', owner_id: 'u1' }],
      );

      const rows = page.savingsCategoryRows();
      expect(rows[0].amount).toBe(50);
    });

    it('returns empty when net savings is zero or negative', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
          { amount: 150, direction: 'in', category_id: 'savings-1', occurred_on: '2026-11-15', source: 'manual', notes: null },
        ],
        [{ id: 'savings-1', kind: 'savings', name: 'Emergency Fund', owner_id: 'u1' }],
      );

      expect(page.savingsCategoryRows().length).toBe(0);
    });

    it('filters by selected month', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
          { amount: 50, direction: 'out', category_id: 'savings-1', occurred_on: '2026-10-10', source: 'manual', notes: null },
        ],
        [{ id: 'savings-1', kind: 'savings', name: 'Emergency Fund', owner_id: 'u1' }],
      );

      const rows = page.savingsCategoryRows();
      expect(rows[0].amount).toBe(100); // only November
    });
  });
});
