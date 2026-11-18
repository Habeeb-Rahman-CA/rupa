import { Transaction } from '../../core/models/domain.models';
import { filterTransactions, relativeDayLabel, summarizeTransactions, toIsoDate, WALLET_CATEGORY_ID } from './transaction-filters';

describe('transaction filters', () => {
  const transactions: Transaction[] = [
    makeTransaction({
      id: 'food-1',
      occurred_on: '2026-10-20',
      amount: 120,
      direction: 'out',
      category_id: 'food',
    }),
    makeTransaction({
      id: 'food-2',
      occurred_on: '2026-10-30',
      amount: 80,
      direction: 'out',
      category_id: 'food',
    }),
    makeTransaction({
      id: 'salary-1',
      occurred_on: '2026-10-25',
      amount: 1000,
      direction: 'in',
      category_id: 'salary',
    }),
  ];

  it('filters by category and includes both date boundaries', () => {
    const result = filterTransactions(transactions, {
      categoryId: 'food',
      fromDate: '2026-10-20',
      toDate: '2026-10-30',
    });

    expect(result.map((transaction) => transaction.id)).toEqual(['food-1', 'food-2']);
  });

  it('separates spending, income, and savings', () => {
    const result = summarizeTransactions(
      [
        ...transactions,
        makeTransaction({
          id: 'savings-1',
          amount: 250,
          direction: 'out',
          category_id: 'savings',
        }),
        makeTransaction({
          id: 'transfer-1',
          amount: 500,
          direction: 'out',
          source: 'transfer',
        }),
        makeTransaction({
          id: 'wallet-recharge-1',
          amount: 300,
          direction: 'out',
          source: 'wallet_recharge',
        }),
      ],
      new Set(['savings']),
    );

    expect(result).toEqual({ spend: 200, income: 1000, savings: 250 });
  });

  it('returns no rows for an invalid reversed date range', () => {
    const result = filterTransactions(transactions, {
      categoryId: null,
      fromDate: '2026-10-31',
      toDate: '2026-10-01',
    });

    expect(result).toEqual([]);
  });

  it('filters wallet spending through its built-in wallet category', () => {
    const result = filterTransactions(
      [
        ...transactions,
        makeTransaction({ id: 'wallet-spend-1', source: 'wallet_spend', wallet_id: 'wallet-1' }),
      ],
      { categoryId: WALLET_CATEGORY_ID, fromDate: null, toDate: null },
    );

    expect(result.map((transaction) => transaction.id)).toEqual(['wallet-spend-1']);
  });

  it('converts local dates to ISO dates without timezone shifting', () => {
    expect(toIsoDate(new Date(2026, 9, 20))).toBe('2026-10-20');
    expect(toIsoDate(null)).toBeNull();
  });

  it('labels today and yesterday relative to the current local date', () => {
    const now = new Date(2026, 10, 18, 23, 59); // Nov 18 2026, late evening

    expect(relativeDayLabel('2026-11-18', now)).toBe('Today');
    expect(relativeDayLabel('2026-11-17', now)).toBe('Yesterday');
    expect(relativeDayLabel('2026-11-16', now)).toBeNull();
    expect(relativeDayLabel('2026-11-19', now)).toBeNull();
  });

  it('rolls the relative labels across month and year boundaries', () => {
    expect(relativeDayLabel('2026-11-30', new Date(2026, 11, 1))).toBe('Yesterday');
    expect(relativeDayLabel('2025-12-31', new Date(2026, 0, 1))).toBe('Yesterday');
  });
});

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx',
    owner_id: 'owner',
    occurred_on: '2026-10-01',
    amount: 0,
    direction: 'out',
    category_id: null,
    notes: null,
    source: 'manual',
    source_ref_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}
