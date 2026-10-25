import { Transaction } from '../../core/models/domain.models';

export interface TransactionFilter {
  categoryId: string | null;
  fromDate: string | null;
  toDate: string | null;
}

export interface TransactionSummary {
  spend: number;
  income: number;
  savings: number;
}

export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] {
  if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate) {
    return [];
  }

  return transactions.filter((transaction) => {
    if (filter.categoryId && transaction.category_id !== filter.categoryId) {
      return false;
    }
    if (filter.fromDate && transaction.occurred_on < filter.fromDate) {
      return false;
    }
    if (filter.toDate && transaction.occurred_on > filter.toDate) {
      return false;
    }
    return true;
  });
}

export function summarizeTransactions(
  transactions: Transaction[],
  savingsCategoryIds: ReadonlySet<string>,
): TransactionSummary {
  return transactions.reduce<TransactionSummary>(
    (summary, transaction) => {
      const amount = Number(transaction.amount);
      const isSavings =
        transaction.category_id !== null && savingsCategoryIds.has(transaction.category_id);

      if (isSavings) {
        summary.savings += transaction.direction === 'out' ? amount : -amount;
      } else if (transaction.direction === 'out') {
        summary.spend += amount;
      } else {
        summary.income += amount;
      }

      return summary;
    },
    { spend: 0, income: 0, savings: 0 },
  );
}

export function toIsoDate(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
