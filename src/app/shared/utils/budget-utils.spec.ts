import {
  Budget,
  BudgetPeriod,
  Category,
  Transaction,
} from '../../core/models/domain.models';
import {
  BUDGET_THRESHOLDS,
  budgetPhase,
  budgetTone,
  computeBudgetSpent,
  nextPeriodRange,
  periodRange,
  toIsoDate,
  todayIso,
  usagePercent,
} from './budget-utils';

function txn(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    owner_id: 'owner',
    occurred_on: '2026-11-10',
    amount: 100,
    direction: 'out',
    category_id: null,
    notes: null,
    source: 'manual',
    source_ref_id: null,
    created_at: '2026-11-10T00:00:00.000Z',
    ...partial,
  };
}

const CATEGORIES: Category[] = [
  { id: 'food', owner_id: 'owner', name: 'Food', kind: 'expense', created_at: '' },
  { id: 'fuel', owner_id: 'owner', name: 'Fuel', kind: 'expense', created_at: '' },
  { id: 'salary', owner_id: 'owner', name: 'Salary', kind: 'income', created_at: '' },
  { id: 'emergency', owner_id: 'owner', name: 'Emergency Fund', kind: 'savings', created_at: '' },
];

function overallBudget(partial: Partial<Budget> = {}): Pick<Budget, 'category_id' | 'start_date' | 'end_date'> {
  return {
    category_id: null,
    start_date: '2026-11-01',
    end_date: '2026-11-30',
    ...partial,
  };
}

function categoryBudget(
  categoryId: string,
  partial: Partial<Budget> = {},
): Pick<Budget, 'category_id' | 'start_date' | 'end_date'> {
  return overallBudget({ category_id: categoryId, ...partial });
}

describe('budget-utils', () => {
  // ------------------------------------------------------------ period math

  describe('periodRange', () => {
    it('builds a 7-day range for weekly budgets', () => {
      expect(periodRange('weekly', '2026-11-11')).toEqual({
        start: '2026-11-11',
        end: '2026-11-17',
      });
    });

    it('normalises monthly budgets to the whole calendar month', () => {
      expect(periodRange('monthly', '2026-11-15')).toEqual({
        start: '2026-11-01',
        end: '2026-11-30',
      });
      expect(periodRange('monthly', '2026-01-31')).toEqual({
        start: '2026-01-01',
        end: '2026-01-31',
      });
      expect(periodRange('monthly', '2024-02-10')).toEqual({
        start: '2024-02-01',
        end: '2024-02-29', // leap year
      });
    });

    it('builds the calendar year for yearly budgets', () => {
      expect(periodRange('yearly', '2026-06-15')).toEqual({
        start: '2026-01-01',
        end: '2026-12-31',
      });
    });

    it('passes custom anchors through untouched', () => {
      expect(periodRange('custom', '2026-11-11')).toEqual({
        start: '2026-11-11',
        end: '2026-11-11',
      });
    });
  });

  describe('nextPeriodRange', () => {
    it('continues weekly budgets into the next week', () => {
      expect(
        nextPeriodRange({
          period: 'weekly',
          start_date: '2026-11-11',
          end_date: '2026-11-17',
        }),
      ).toEqual({ start: '2026-11-18', end: '2026-11-24' });
    });

    it('continues monthly budgets into the next month, across years', () => {
      expect(
        nextPeriodRange({
          period: 'monthly',
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        }),
      ).toEqual({ start: '2026-12-01', end: '2026-12-31' });
      expect(
        nextPeriodRange({
          period: 'monthly',
          start_date: '2026-12-01',
          end_date: '2026-12-31',
        }),
      ).toEqual({ start: '2027-01-01', end: '2027-01-31' });
    });

    it('continues yearly budgets into the next year', () => {
      expect(
        nextPeriodRange({
          period: 'yearly',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        }),
      ).toEqual({ start: '2027-01-01', end: '2027-12-31' });
    });

    it('continues custom budgets with the same duration', () => {
      expect(
        nextPeriodRange({
          period: 'custom',
          start_date: '2026-11-01',
          end_date: '2026-11-10',
        }),
      ).toEqual({ start: '2026-11-11', end: '2026-11-20' });
    });
  });

  describe('budgetPhase', () => {
    const range = { start: '2026-11-01', end: '2026-11-30' };

    it('classifies dates before, inside and after the period', () => {
      expect(budgetPhase(range, '2026-10-31')).toBe('upcoming');
      expect(budgetPhase(range, '2026-11-01')).toBe('current');
      expect(budgetPhase(range, '2026-11-15')).toBe('current');
      expect(budgetPhase(range, '2026-11-30')).toBe('current');
      expect(budgetPhase(range, '2026-12-01')).toBe('past');
    });
  });

  // ------------------------------------------------------------- accounting

  describe('computeBudgetSpent', () => {
    it('counts actual out-expenses inside the period', () => {
      const spent = computeBudgetSpent(
        overallBudget(),
        [
          txn({ id: 't1', amount: 100, occurred_on: '2026-11-05' }),
          txn({ id: 't2', amount: 50, occurred_on: '2026-11-20' }),
          // outside the period
          txn({ id: 't3', amount: 999, occurred_on: '2026-12-05' }),
          txn({ id: 't4', amount: 999, occurred_on: '2026-10-31' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(150);
    });

    it('excludes account transfers and wallet recharges', () => {
      const spent = computeBudgetSpent(
        overallBudget(),
        [
          txn({ id: 't1', amount: 100 }),
          txn({ id: 't2', amount: 500, source: 'transfer', direction: 'out' }),
          txn({ id: 't3', amount: 500, source: 'transfer', direction: 'in' }),
          txn({ id: 't4', amount: 300, source: 'wallet_recharge', direction: 'out' }),
          txn({ id: 't5', amount: 250, source: 'opening', direction: 'out' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(100);
    });

    it('counts wallet spending exactly once', () => {
      const walletSpend = txn({
        id: 'wallet-spend-1',
        amount: 40,
        source: 'wallet_spend',
        category_id: 'food',
      });
      const spent = computeBudgetSpent(
        overallBudget(),
        [walletSpend],
        CATEGORIES,
      );
      expect(spent).toBe(40);
    });

    it('never double-counts a duplicated transaction id', () => {
      const duplicate = txn({ id: 'same-id', amount: 100 });
      const spent = computeBudgetSpent(
        overallBudget(),
        [duplicate, { ...duplicate }, { ...duplicate }],
        CATEGORIES,
      );
      expect(spent).toBe(100);
    });

    it('excludes savings movements from overall budgets', () => {
      const spent = computeBudgetSpent(
        overallBudget(),
        [
          txn({ id: 't1', amount: 100, category_id: 'food' }),
          txn({ id: 't2', amount: 400, category_id: 'emergency' }),
          txn({ id: 't3', amount: 400, category_id: 'emergency', direction: 'in' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(100);
    });

    it('nets refunds inside expense categories but ignores incoming income', () => {
      const spent = computeBudgetSpent(
        overallBudget(),
        [
          txn({ id: 't1', amount: 500, category_id: 'food' }),
          txn({ id: 't2', amount: 200, category_id: 'food', direction: 'in' }), // refund
          txn({ id: 't3', amount: 900, category_id: 'salary', direction: 'in' }), // salary
          txn({ id: 't4', amount: 300, direction: 'in' }), // untagged income
        ],
        CATEGORIES,
      );
      expect(spent).toBe(300);
    });

    it('scopes category budgets to their category and nets its refunds', () => {
      const spent = computeBudgetSpent(
        categoryBudget('food'),
        [
          txn({ id: 't1', amount: 500, category_id: 'food' }),
          txn({ id: 't2', amount: 100, category_id: 'food', direction: 'in' }),
          txn({ id: 't3', amount: 700, category_id: 'fuel' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(400);
    });

    it('floors the total at zero when refunds exceed spending', () => {
      const spent = computeBudgetSpent(
        categoryBudget('food'),
        [
          txn({ id: 't1', amount: 100, category_id: 'food', direction: 'in' }),
          txn({ id: 't2', amount: 40, category_id: 'food', direction: 'in' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(0);
    });

    it('treats period bounds as inclusive', () => {
      const spent = computeBudgetSpent(
        overallBudget(),
        [
          txn({ id: 't1', amount: 10, occurred_on: '2026-11-01' }),
          txn({ id: 't2', amount: 20, occurred_on: '2026-11-30' }),
        ],
        CATEGORIES,
      );
      expect(spent).toBe(30);
    });
  });

  // --------------------------------------------------------------- display

  describe('usage & tone', () => {
    it('computes the usage percentage', () => {
      expect(usagePercent(50, 100)).toBe(50);
      expect(usagePercent(0, 100)).toBe(0);
      expect(usagePercent(150, 100)).toBe(150); // overspend stays visible
      expect(usagePercent(10, 0)).toBe(0);
      expect(usagePercent(-5, 100)).toBe(0);
    });

    it('buckets usage into ok / warning / over', () => {
      expect(budgetTone(0)).toBe('ok');
      expect(budgetTone(74)).toBe('ok');
      expect(budgetTone(75)).toBe('warning');
      expect(budgetTone(99)).toBe('warning');
      expect(budgetTone(100)).toBe('over');
      expect(budgetTone(250)).toBe('over');
    });

    it('exposes only the four supported milestones', () => {
      expect([...BUDGET_THRESHOLDS]).toEqual([50, 75, 90, 100]);
    });
  });

  describe('date helpers', () => {
    it('formats dates as local YYYY-MM-DD', () => {
      expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
