import { Transaction } from '../../core/models/domain.models';
import { filterTransactions, summarizeTransactions, toIsoDate } from './transaction-filters';

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

  it('converts local dates to ISO dates without timezone shifting', () => {
    expect(toIsoDate(new Date(2026, 9, 20))).toBe('2026-10-20');
    expect(toIsoDate(null)).toBeNull();
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
