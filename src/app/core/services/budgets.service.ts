import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Budget, BudgetPeriod } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { CategoriesService } from './categories.service';
import { roundCurrency } from '../../shared/utils/currency-utils';
import {
  BudgetPhase,
  BudgetTone,
  budgetPhase,
  budgetTone,
  computeBudgetSpent,
  nextPeriodRange,
  todayIso,
  usagePercent,
} from '../../shared/utils/budget-utils';

/** Payload accepted by `create`/`update` (everything except identity/meta). */
export interface BudgetInput {
  name: string;
  category_id: string | null;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string;
  recurring: boolean;
  thresholds: number[];
}

/** One budget with its live usage — the page renders these directly. */
export interface BudgetRow {
  budget: Budget;
  spent: number;
  /** amount − spent; negative when overspent. */
  remaining: number;
  percent: number;
  tone: BudgetTone;
  phase: BudgetPhase;
}

/**
 * Owns the budgets table: CRUD, live usage against the transaction ledger
 * (see `computeBudgetSpent` for the accounting rules) and the automatic
 * roll-over of recurring budgets into their next period.
 */
@Injectable({ providedIn: 'root' })
export class BudgetsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly _budgets = signal<Budget[]>([]);
  private readonly _isLoading = signal(false);

  readonly budgets = this._budgets.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._budgets.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._budgets.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('budgets')
          .select('*')
          .order('start_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load budgets', error);
          return;
        }
        this._budgets.set((data ?? []) as Budget[]);
        await this.rolloverRecurring();
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(input: BudgetInput): Promise<Budget> {
    const owner_id = this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('budgets')
      .insert({ ...input, owner_id, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;

    const created = data as Budget;
    this._budgets.update((list) => [created, ...list]);
    return created;
  }

  async update(id: string, patch: Partial<BudgetInput>): Promise<void> {
    const { error } = await this.supabase.client
      .from('budgets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    this._budgets.update((list) =>
      list.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  /** Optimistic removal; the row is restored at its old index on failure. */
  async delete(id: string): Promise<void> {
    const current = this._budgets();
    const index = current.findIndex((b) => b.id === id);
    if (index === -1) return;
    const removed = current[index];

    this._budgets.update((list) => list.filter((b) => b.id !== id));

    const { error } = await this.supabase.client
      .from('budgets')
      .delete()
      .eq('id', id);
    if (error) {
      this._budgets.update((list) => {
        if (list.some((b) => b.id === id)) return list;
        const restored = [...list];
        restored.splice(Math.min(index, restored.length), 0, removed);
        return restored;
      });
      throw error;
    }
  }

  // ------------------------------------------------------------- roll-over

  /**
   * After a recurring budget's period ends, create its next period's budget
   * (the finished row stays behind as history). Long-dormant budgets jump
   * straight to the period containing today instead of spraying every
   * missed period into the list; an existing row for the same target period
   * is never duplicated.
   */
  private async rolloverRecurring(): Promise<void> {
    const today = todayIso();
    const expired = this._budgets().filter(
      (b) => b.recurring && b.end_date < today,
    );

    for (const budget of expired) {
      let range = nextPeriodRange(budget);
      let steps = 0;
      while (range.end < today && steps++ < 1000) {
        range = nextPeriodRange({ ...budget, ...range });
      }

      const duplicate = this._budgets().some(
        (b) =>
          b.name === budget.name &&
          b.category_id === budget.category_id &&
          b.start_date === range.start,
      );
      if (duplicate) continue;

      try {
        const created = await this.create({
          name: budget.name,
          category_id: budget.category_id,
          amount: budget.amount,
          period: budget.period,
          start_date: range.start,
          end_date: range.end,
          recurring: budget.recurring,
          thresholds: [...budget.thresholds],
        });
        // `create` already prepends it — nothing else to do on success.
        void created;
      } catch (error) {
        console.error('Failed to roll over budget', budget.id, error);
      }
    }
  }

  // --------------------------------------------------------------- derived

  /** Every budget with its live usage, newest period first. */
  readonly rows = computed<BudgetRow[]>(() => {
    const transactions = this.transactionsService.transactions();
    const categories = this.categoriesService.categories();
    const today = todayIso();

    return this._budgets().map((budget) => {
      const spent = computeBudgetSpent(budget, transactions, categories);
      const amount = Number(budget.amount);
      const percent = usagePercent(spent, amount);
      return {
        budget,
        spent,
        remaining: roundCurrency(amount - spent),
        percent,
        tone: budgetTone(percent),
        phase: budgetPhase(
          { start: budget.start_date, end: budget.end_date },
          today,
        ),
      };
    });
  });

  readonly activeRows = computed(() =>
    this.rows().filter((r) => r.phase === 'current'),
  );

  readonly upcomingRows = computed(() =>
    this.rows().filter((r) => r.phase === 'upcoming'),
  );

  /** Finished periods, most recent first — the performance history. */
  readonly historyRows = computed(() =>
    this.rows()
      .filter((r) => r.phase === 'past')
      .sort((a, b) => b.budget.end_date.localeCompare(a.budget.end_date)),
  );

  /** Combined usage of everything currently in progress. */
  readonly overview = computed(() => {
    const rows = this.activeRows();
    const limit = rows.reduce((sum, r) => sum + Number(r.budget.amount), 0);
    const spent = rows.reduce((sum, r) => sum + r.spent, 0);
    const percent = usagePercent(spent, limit);
    return {
      limit: roundCurrency(limit),
      spent: roundCurrency(spent),
      remaining: roundCurrency(limit - spent),
      percent,
      tone: budgetTone(percent),
      overCount: rows.filter((r) => r.tone === 'over').length,
    };
  });

  /** Actual spending across an arbitrary date range (overall rules). */
  spentIn(start: string, end: string): number {
    return computeBudgetSpent(
      { category_id: null, start_date: start, end_date: end },
      this.transactionsService.transactions(),
      this.categoriesService.categories(),
    );
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}
