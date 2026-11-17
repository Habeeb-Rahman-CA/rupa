/**
 * Budget period math and the budget accounting rules.
 *
 * Everything here is pure so the rules can be unit-tested without TestBed
 * (see budget-utils.spec.ts). The Edge Function that fires threshold push
 * notifications mirrors `computeBudgetSpent` server-side — keep the two in
 * sync when changing the rules below.
 */

import {
  Budget,
  BudgetPeriod,
  Category,
  StatsTransaction,
  isSavingsCategory,
} from '../../core/models/domain.models';
import { roundCurrency } from './currency-utils';

/** Push-notification milestones the user can toggle per budget. */
export const BUDGET_THRESHOLDS = [50, 75, 90, 100] as const;

export interface DateRange {
  start: string;
  end: string;
}

/** Budget usage buckets driving the progress-bar colour. */
export type BudgetTone = 'ok' | 'warning' | 'over';

/** Where a budget period sits relative to today. */
export type BudgetPhase = 'past' | 'current' | 'upcoming';

/**
 * Sources that move money without being actual spending:
 *  - opening          — opening balance rows
 *  - transfer         — both legs of an account-to-account transfer
 *  - wallet_recharge  — money moved bank → wallet (not a purchase)
 * Wallet spending (`wallet_spend`) is a real expense and IS counted — it
 * lives in the same `transactions` table, so nothing is double-counted by
 * also reading `wallet_transactions`.
 */
const NON_SPEND_SOURCES = new Set(['opening', 'transfer', 'wallet_recharge']);

// --------------------------------------------------------------- date math

/** Local `YYYY-MM-DD` for a Date (per-file pattern — never `toISOString()`). */
export function toIsoDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** `YYYY-MM-DD` → local Date (avoids the UTC shift of `new Date(iso)`). */
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(iso: string, days: number): string {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

// ----------------------------------------------------------- period ranges

/**
 * The period that contains `anchorIso` for a recurring/standard budget:
 *  - weekly   → anchor … anchor + 6 days
 *  - monthly  → 1st … last day of the anchor's month
 *  - yearly   → Jan 1 … Dec 31 of the anchor's year
 *  - custom   → the caller owns both bounds; anchor is returned as-is
 */
export function periodRange(period: BudgetPeriod, anchorIso: string): DateRange {
  switch (period) {
    case 'weekly':
      return { start: anchorIso, end: addDays(anchorIso, 6) };
    case 'monthly': {
      const d = parseLocal(anchorIso);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { start: toIsoDate(start), end: toIsoDate(end) };
    }
    case 'yearly': {
      const d = parseLocal(anchorIso);
      return {
        start: toIsoDate(new Date(d.getFullYear(), 0, 1)),
        end: toIsoDate(new Date(d.getFullYear(), 11, 31)),
      };
    }
    default:
      return { start: anchorIso, end: anchorIso };
  }
}

/**
 * The period immediately AFTER an existing one — used to roll recurring
 * budgets forward:
 *  - weekly   → consecutive week (end + 1 day … + 6)
 *  - monthly  → the calendar month after the old end date
 *  - yearly   → the calendar year after the old end date
 *  - custom   → consecutive block of the same duration as the old period
 */
export function nextPeriodRange(
  budget: Pick<Budget, 'period' | 'start_date' | 'end_date'>,
): DateRange {
  const dayAfterEnd = addDays(budget.end_date, 1);
  switch (budget.period) {
    case 'weekly':
      return { start: dayAfterEnd, end: addDays(dayAfterEnd, 6) };
    case 'monthly':
    case 'yearly':
      return periodRange(budget.period, dayAfterEnd);
    default: {
      const duration =
        Math.round(
          (parseLocal(budget.end_date).getTime() -
            parseLocal(budget.start_date).getTime()) /
            86_400_000,
        ) + 1;
      return { start: dayAfterEnd, end: addDays(dayAfterEnd, duration - 1) };
    }
  }
}

/** Where a period sits relative to today (bounds are inclusive). */
export function budgetPhase(range: DateRange, today: string): BudgetPhase {
  if (today < range.start) return 'upcoming';
  if (today > range.end) return 'past';
  return 'current';
}

// -------------------------------------------------------------- accounting

/**
 * Spent amount for one budget period.
 *
 * Rules (kept in sync with the push Edge Function):
 *  - counts actual expenses only (`direction === 'out'`);
 *  - excludes account-to-account transfers, wallet recharges and opening
 *    balance rows — they move money, they don't spend it;
 *  - counts wallet spending (its `wallet_spend` transaction row) exactly
 *    once — the wallet ledger is never consulted;
 *  - refunds/credits recorded as `direction === 'in'` inside the budget's
 *    scope subtract from the spent total (expense categories only for
 *    overall budgets, so salary income never reduces spending);
 *  - edits and deletions are handled for free: the live transaction list is
 *    always the source of truth, and a deleted transaction no longer exists;
 *  - each transaction id is counted at most once per budget, so duplicated
 *    rows can never double-count.
 */
export function computeBudgetSpent(
  budget: Pick<Budget, 'category_id' | 'start_date' | 'end_date'>,
  transactions: readonly StatsTransaction[],
  categories: Category[],
): number {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const savingsIds = new Set(
    categories.filter((c) => isSavingsCategory(c)).map((c) => c.id),
  );
  const seen = new Set<string>();
  let spent = 0;

  for (const t of transactions) {
    if (NON_SPEND_SOURCES.has(t.source)) continue;
    if (!t.occurred_on) continue;
    if (t.occurred_on < budget.start_date || t.occurred_on > budget.end_date) continue;

    // Count each transaction at most once per budget.
    if (seen.has(t.id)) continue;
    seen.add(t.id);

    const amount = Number(t.amount);
    if (!(amount > 0)) continue;

    if (budget.category_id !== null) {
      // Category budget: only that category, refunds netted against it.
      if (t.category_id !== budget.category_id) continue;
      if (t.direction === 'out') spent += amount;
      else if (t.direction === 'in') spent -= amount;
      continue;
    }

    // Overall budget: savings movements are not spending.
    if (t.category_id && savingsIds.has(t.category_id)) continue;
    if (t.direction === 'out') {
      spent += amount;
    } else if (t.direction === 'in') {
      const category = t.category_id ? categoryById.get(t.category_id) : null;
      // Only money coming back into an expense category counts as a refund.
      if (category?.kind === 'expense') spent -= amount;
    }
  }

  // Refunds can never make a period look like it spent less than zero.
  return Math.max(0, roundCurrency(spent));
}

// ---------------------------------------------------------------- display

/** Usage percentage of a budget (rounded, floored at 0, may exceed 100). */
export function usagePercent(spent: number, amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.max(0, Math.round((spent / amount) * 100));
}

/** Colour bucket for progress bars and chips. */
export function budgetTone(percent: number): BudgetTone {
  if (percent >= 100) return 'over';
  if (percent >= 75) return 'warning';
  return 'ok';
}
