import { Transaction } from '../../core/models/domain.models';

export const WALLET_CATEGORY_ID = '__wallet_spending__';

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
    if (transaction.source === 'wallet_recharge') return false;
    if (filter.categoryId === WALLET_CATEGORY_ID) {
      return transaction.source === 'wallet_spend';
    }
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
      if (transaction.source === 'transfer' || transaction.source === 'wallet_recharge') return summary;
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

/**
 * Relative label for a transaction date group: "Today" / "Yesterday", or null
 * for anything older (the caller falls back to a formatted calendar date).
 *
 * `isoDate` is a local calendar date — the same shape `occurred_on` is stored
 * in — so both sides are compared as local dates via `toIsoDate`, keeping the
 * comparison free of timezone shifts. `now` is injectable for tests.
 */
export function relativeDayLabel(
  isoDate: string,
  now: Date = new Date(),
): 'Today' | 'Yesterday' | null {
  if (isoDate === toIsoDate(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isoDate === toIsoDate(yesterday)) return 'Yesterday';
  return null;
}
