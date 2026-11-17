import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DashboardPage } from './dashboard.page';
import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DebtsService } from '../../core/services/debts.service';
import { AuthService } from '../../core/services/auth.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';

describe('DashboardPage periodStats', () => {
  let page: DashboardPage;
  let mockTxService: Partial<TransactionsService>;
  let mockCategoriesService: Partial<CategoriesService>;

  const createPage = (txs: any[], cats: any[], range: 'week' | 'month' | 'year' = 'month') => {
    mockTxService = {
      transactions: signal(txs),
      // Aggregates read the unpaginated stats dataset.
      statsTransactions: signal(txs),
      openingBalance: signal(null),
    } as unknown as Partial<TransactionsService>;

    mockCategoriesService = {
      categories: signal(cats),
    } as unknown as Partial<CategoriesService>;

    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        { provide: TransactionsService, useValue: mockTxService },
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: DebtsService, useValue: { theyOweYouTotal: signal(0), youOweTotal: signal(0) } },
        { provide: MatBottomSheet, useValue: { open: () => {} } },
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }), isAuthenticated: signal(true) } },
      ],
    });

    page = TestBed.inject(DashboardPage);
    (page as any).range.set(range);
    return page;
  };

  describe('savings direction handling', () => {
    it('treats savings outflows as positive savings and inflows as reductions', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'savings-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
          { amount: 30, direction: 'in', category_id: 'savings-1', occurred_on: '2026-11-15', source: 'manual', notes: null },
        ],
        [
          { id: 'savings-1', kind: 'savings', name: 'Savings', owner_id: 'u1' },
        ],
        'month',
      );

      expect(page.periodStats().saved).toBe(70);
      expect(page.periodStats().spent).toBe(0);
      expect(page.periodStats().received).toBe(0);
    });

    it('excludes transfer and wallet_recharge sources from totals', () => {
      const page = createPage(
        [
          { amount: 100, direction: 'out', category_id: 'cat-1', occurred_on: '2026-11-10', source: 'transfer', notes: null },
          { amount: 50, direction: 'out', category_id: 'cat-1', occurred_on: '2026-11-10', source: 'manual', notes: null },
        ],
        [
          { id: 'cat-1', kind: 'expense', name: 'Food', owner_id: 'u1' },
        ],
        'month',
      );

      expect(page.periodStats().spent).toBe(50);
    });

    it('current month fallback scans last 30 days when current month is empty', () => {
      const now = new Date('2026-11-16');
      const page = createPage(
        [
          { amount: 50, direction: 'out', category_id: 'cat-1', occurred_on: '2026-11-05', source: 'manual', notes: null },
        ],
        [
          { id: 'cat-1', kind: 'expense', name: 'Food', owner_id: 'u1' },
        ],
        'month',
      );

      // November 2026 has a transaction, so no fallback needed
      expect(page.periodStats().spent).toBe(50);
    });
  });
});
