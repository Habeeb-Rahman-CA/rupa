import { Injectable, effect, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Budget, BudgetPeriod } from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface BudgetResponse {
  id: string;
  owner_id: string;
  name: string;
  category_id: string | null;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string;
  recurring: boolean;
  thresholds: number[];
  created_at: string;
  updated_at: string;
}

interface CreateBudgetRequest {
  name: string;
  category_id: string | null;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string;
  recurring: boolean;
  thresholds: number[];
}

interface UpdateBudgetRequest {
  name?: string;
  category_id?: string | null;
  amount?: number;
  period?: BudgetPeriod;
  start_date?: string;
  end_date?: string;
  recurring?: boolean;
  thresholds?: number[];
}

interface DeleteResponse {
  message: string;
}

/** Input shape used by the budget dialog. */
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

/** Row shape used by the budgets page. */
export interface BudgetRow {
  id: string;
  owner_id: string;
  name: string;
  category_id: string | null;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string;
  recurring: boolean;
  thresholds: number[];
  spent: number;
  remaining: number;
  status: 'on-track' | 'near-limit' | 'exceeded';
  tone: 'on-track' | 'warning' | 'over';
  percent: number;
  budget: Budget;
}

interface BudgetOverview {
  totalBudgets: number;
  activeBudgets: number;
  totalSpent: number;
  totalAllocated: number;
  overCount: number;
  tone: 'on-track' | 'warning' | 'over';
  percent: number;
  spent: number;
  limit: number;
  remaining: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _budgets = signal<Budget[]>([]);
  private readonly _isLoading = signal(false);

  readonly budgets = this._budgets.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  readonly rows = computed<BudgetRow[]>(() => this._budgets().map((b) => this.toRow(b)));
  readonly activeRows = computed<BudgetRow[]>(() => this.rows().filter((r) => r.status !== 'exceeded'));
  readonly upcomingRows = computed<BudgetRow[]>(() => this.rows().filter((r) => r.status === 'near-limit'));
  readonly historyRows = computed<BudgetRow[]>(() => this.rows().filter((r) => r.status === 'exceeded'));
  readonly overview = computed<BudgetOverview>(() => {
    const rows = this.rows();
    const overCount = rows.filter((r) => r.status === 'exceeded').length;
    const totalSpent = rows.reduce((sum, r) => sum + r.spent, 0);
    const totalAllocated = rows.reduce((sum, r) => sum + r.amount, 0);
    const tone = overCount > 0 ? 'over' : totalSpent > totalAllocated * 0.9 ? 'warning' : 'on-track';
    const percent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
    return {
      totalBudgets: rows.length,
      activeBudgets: rows.filter((r) => r.status !== 'exceeded').length,
      totalSpent,
      totalAllocated,
      overCount,
      tone,
      percent,
      spent: totalSpent,
      limit: totalAllocated,
      remaining: totalAllocated - totalSpent,
    };
  });

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
        const rows = await firstValueFrom(
          this.api.get<BudgetResponse[]>('/budgets'),
        );
        this._budgets.set(rows as Budget[]);
      } catch (err) {
        console.error('Failed to load budgets', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /** Create an alias for component compatibility. */
  async create(input: BudgetInput): Promise<Budget> {
    return this.createBudget(input);
  }

  async createBudget(input: {
    name: string;
    category_id: string | null;
    amount: number;
    period: BudgetPeriod;
    start_date: string;
    end_date: string;
    recurring: boolean;
    thresholds: number[];
  }): Promise<Budget> {
    try {
      const created = await firstValueFrom(
        this.api.post<BudgetResponse>('/budgets', {
          name: input.name.trim(),
          category_id: input.category_id,
          amount: input.amount,
          period: input.period,
          start_date: input.start_date,
          end_date: input.end_date,
          recurring: input.recurring,
          thresholds: input.thresholds,
        } as CreateBudgetRequest),
      );
      const budget = created as Budget;
      this._budgets.update((list) => [...list, budget]);
      return budget;
    } catch (error) {
      console.error('Failed to create budget', error);
      throw error;
    }
  }

  /** Create an alias for component compatibility. */
  async update(id: string, input: Partial<BudgetInput>): Promise<Budget> {
    return this.updateBudget(id, input);
  }

  async updateBudget(id: string, input: {
    name?: string;
    category_id?: string | null;
    amount?: number;
    period?: BudgetPeriod;
    start_date?: string;
    end_date?: string;
    recurring?: boolean;
    thresholds?: number[];
  }): Promise<Budget> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<BudgetResponse>(`/budgets/${id}`, input as UpdateBudgetRequest),
      );
      const budget = updated as Budget;
      this._budgets.update((list) => list.map((b) => (b.id === id ? budget : b)));
      return budget;
    } catch (error) {
      console.error('Failed to update budget', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/budgets/${id}`));
      this._budgets.update((list) => list.filter((b) => b.id !== id));
    } catch (error) {
      console.error('Failed to delete budget', error);
      throw error;
    }
  }

  spentIn(start: string, end: string): number {
    return 0;
  }

  private toRow(budget: Budget): BudgetRow {
    const spent = 0;
    const percent = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
    const tone = spent > budget.amount ? 'over' : spent > budget.amount * 0.9 ? 'warning' : 'on-track';
    const status = spent > budget.amount ? 'exceeded' : spent > budget.amount * 0.9 ? 'near-limit' : 'on-track';
    return {
      id: budget.id,
      owner_id: budget.owner_id,
      name: budget.name,
      category_id: budget.category_id,
      amount: budget.amount,
      period: budget.period,
      start_date: budget.start_date,
      end_date: budget.end_date,
      recurring: budget.recurring,
      thresholds: budget.thresholds,
      spent,
      remaining: budget.amount - spent,
      status,
      tone,
      percent,
      budget,
    };
  }
}
