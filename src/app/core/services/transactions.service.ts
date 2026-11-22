import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Transaction,
  StatsTransaction,
  TxDirection,
  PaymentMode,
  isSavingsCategory,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { CategoriesService } from './categories.service';
import { DebtsService } from './debts.service';
import { BankAccountsService } from './bank-accounts.service';
import { todayIso } from '../../shared/utils/budget-utils';

export interface CreateTransactionInput {
  amount: number;
  direction: TxDirection;
  occurred_on?: string; // ISO date; defaults to today
  category_id?: string | null;
  notes?: string | null;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
  source?: 'manual' | 'debt' | 'opening' | 'subscription';
  source_ref_id?: string | null;
}

export interface MonthlyStats {
  spent: number;
  received: number;
  saved: number;
}

const emptyStats: MonthlyStats = { spent: 0, received: 0, saved: 0 };

interface TransactionResponse {
  id: string;
  owner_id: string;
  occurred_on: string;
  amount: number;
  direction: TxDirection;
  category_id: string | null;
  notes: string | null;
  source: string;
  source_ref_id: string | null;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
  created_at: string;
}

interface CreateTransactionRequest {
  amount: number;
  direction: TxDirection;
  occurred_on: string;
  category_id: string | null;
  notes: string | null;
  source: string;
  source_ref_id: string | null;
  payment_mode: PaymentMode;
  bank_account_id: string | null;
}

interface OpeningBalanceResponse {
  balance: number;
}

interface DeleteResponse {
  message: string;
}

interface AssignRequest {
  account_id: string;
  transaction_ids: string[];
}

interface CategorizeRequest {
  category_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly injector = inject(Injector);

  private readonly _transactions = signal<Transaction[]>([]);
  private readonly _stats = signal<StatsTransaction[]>([]);
  private readonly _balance = signal<number>(0);
  private readonly _openingBalance = signal<number | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _hasMore = signal(false);
  private readonly _lastCursor = signal<string | null>(null);

  readonly transactions = this._transactions.asReadonly();
  readonly balance = this._balance.asReadonly();
  readonly openingBalance = this._openingBalance.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();

  readonly statsTransactions = this._stats.asReadonly();

  readonly monthly = computed<MonthlyStats>(() => {
    const txs = this._stats();
    const categories = this.categoriesService.categories();
    const savingsCatIds = new Set<string>(
      categories.filter((c) => isSavingsCategory(c)).map((c) => c.id),
    );

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    let spent = 0;
    let received = 0;
    let saved = 0;

    for (const t of txs) {
      if (
        t.source === 'opening' ||
        t.source === 'transfer' ||
        t.source === 'wallet_recharge' ||
        !t.occurred_on
      )
        continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;

      const amt = Number(t.amount);
      const isSavings = t.category_id ? savingsCatIds.has(t.category_id) : false;

      if (isSavings) {
        if (t.direction === 'out') saved += amt;
        else if (t.direction === 'in') saved -= amt;
      } else if (t.direction === 'out') {
        spent += amt;
      } else if (t.direction === 'in') {
        received += amt;
      }
    }

    return { spent, received, saved };
  });

  readonly totalSavings = computed<number>(() => {
    const txs = this._stats();
    const categories = this.categoriesService.categories();
    const savingsCatIds = new Set<string>(
      categories.filter((c) => isSavingsCategory(c)).map((c) => c.id),
    );

    let total = 0;
    for (const t of txs) {
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
      if (t.category_id && savingsCatIds.has(t.category_id)) {
        if (t.direction === 'out') total += Number(t.amount);
        else if (t.direction === 'in') total -= Number(t.amount);
      }
    }
    return total;
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.refresh();
      } else {
        this._transactions.set([]);
        this._stats.set([]);
        this._balance.set(0);
        this._openingBalance.set(null);
      }
    });

    effect(() => {
      try {
        const bankAccountsService = this.injector.get(BankAccountsService);
        const primary = bankAccountsService.primaryAccount();
        if (primary && this._transactions().length > 0) {
          void this.mapUnassignedTransactionsToPrimary(primary.id);
        }
      } catch {}
    });
  }

  async mapUnassignedTransactionsToPrimary(bankAccountId: string): Promise<void> {
    const unassignedIds = new Set<string>();
    const isUnassigned = (t: Transaction | StatsTransaction): boolean =>
      t.payment_mode === 'bank' && !t.bank_account_id;
    for (const t of this._transactions()) if (isUnassigned(t)) unassignedIds.add(t.id);
    for (const t of this._stats()) if (isUnassigned(t)) unassignedIds.add(t.id);
    if (unassignedIds.size === 0) return;

    const claimPrimary = <T extends Transaction | StatsTransaction>(t: T): T =>
      isUnassigned(t) ? { ...t, bank_account_id: bankAccountId } : t;

    this._transactions.update((list) => list.map(claimPrimary));
    this._stats.update((list) => list.map(claimPrimary));

    try {
      await firstValueFrom(
        this.api.post('/transactions/assign', {
          account_id: bankAccountId,
          transaction_ids: [...unassignedIds],
        } as AssignRequest),
      );
    } catch {
      console.error('Failed to map bank transactions to the primary account');
    }
  }

  private refreshPromise: Promise<void> | null = null;

  async refresh(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._transactions.set([]);
      this._stats.set([]);
      this._balance.set(0);
      this._openingBalance.set(null);
      return;
    }
    if (this.refreshPromise) return this.refreshPromise;

    this._isLoading.set(true);
    this.refreshPromise = (async () => {
      try {
        // Reset pagination state on full refresh
        this._hasMore.set(false);
        this._lastCursor.set(null);
        await Promise.all([
          this.loadTransactions(),
          this.loadStats(),
          this.loadBalance(),
          this.loadOpeningBalance(),
        ]);
        try {
          const bankAccountsService = this.injector.get(BankAccountsService);
          const primary = bankAccountsService.primaryAccount();
          if (primary) {
            void this.mapUnassignedTransactionsToPrimary(primary.id);
          }
        } catch {}
      } finally {
        this._isLoading.set(false);
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async loadTransactions(limit = 50, cursor?: string): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) return;

    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params['cursor'] = cursor;

    try {
      const rows = await firstValueFrom(
        this.api.get<TransactionResponse[]>('/transactions', { params }),
      ) as Transaction[];

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      // Filter out duplicates at the cursor boundary (same occurred_on as cursor)
      const loadedIds = new Set(this._transactions().map((t) => t.id));
      const newPage = cursor ? page.filter((t) => !loadedIds.has(t.id)) : page;

      if (cursor) {
        this._transactions.update((list) => [...list, ...newPage]);
      } else {
        this._transactions.set(newPage);
      }

      this._hasMore.set(hasMore);
      const last = newPage[newPage.length - 1];
      this._lastCursor.set(last ? last.occurred_on : null);
    } catch (error) {
      console.error('Failed to load transactions', error);
    }
  }

  async loadMoreTransactions(): Promise<void> {
    const cursor = this._lastCursor();
    if (!cursor || !this._hasMore()) return;
    await this.loadTransactions(50, cursor);
  }

  /**
   * Loads every transaction (narrow columns) for aggregate math.
   */
  async loadStats(): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this._stats.set([]);
      return;
    }

    const pageSize = 1000;
    const all: StatsTransaction[] = [];

    for (let from = 0; ; from += pageSize) {
      try {
        const rows = await firstValueFrom(
          this.api.get<StatsTransaction[]>('/transactions/stats', {
            params: { range_start: String(from), range_size: String(pageSize) },
          }),
        ) as StatsTransaction[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      } catch (error) {
        console.error('Failed to load transaction stats', error);
        return;
      }
    }

    this._stats.set(all);
  }

  async loadBalance(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.api.get<OpeningBalanceResponse>('/transactions/balance'),
      );
      this._balance.set(Number(resp.balance ?? 0));
    } catch (error) {
      console.error('Failed to load balance', error);
    }
  }

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');

    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    let targetBankAccountId = input.bank_account_id ?? null;
    let mode = input.payment_mode ?? 'bank';

    // Default to bank mode with the primary account when no mode is specified.
    // Fall back to cash if no bank accounts exist.
    if (mode === 'bank' && !targetBankAccountId) {
      try {
        const bankAccountsService = this.injector.get(BankAccountsService);
        const primary = bankAccountsService.primaryAccount();
        if (primary) {
          targetBankAccountId = primary.id;
        } else {
          mode = 'cash';
        }
      } catch {
        mode = 'cash';
      }
    }

    const occurredOn = input.occurred_on ?? todayIso();

    const request: CreateTransactionRequest = {
      amount: input.amount,
      direction: input.direction,
      occurred_on: occurredOn,
      category_id: input.category_id ?? null,
      notes: input.notes?.trim() || null,
      source: input.source ?? 'manual',
      source_ref_id: input.source_ref_id ?? null,
      payment_mode: mode,
      bank_account_id: targetBankAccountId,
    };

    try {
      const created = await firstValueFrom(
        this.api.post<TransactionResponse>('/transactions', request),
      ) as Transaction;

      this._transactions.update((list) => [created, ...list]);
      this._stats.update((list) => [created, ...list]);
      this.applyToTotals(created, +1);
      return created;
    } catch (error) {
      console.error('Failed to create transaction', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const removed = this._transactions().find((t) => t.id === id);
    if (!removed) return;
    if (
      removed.source === 'transfer' ||
      removed.source === 'wallet_recharge' ||
      removed.source === 'wallet_spend'
    ) {
      throw new Error('Linked entries must be managed from their dedicated screen.');
    }

    // 1. Optimistic removal from state for immediate UI feedback
    this._transactions.update((list) => list.filter((t) => t.id !== id));
    this._stats.update((list) => list.filter((t) => t.id !== id));
    this.applyToTotals(removed, -1);

    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/transactions/${id}`));

      // Refresh DebtsService if present
      try {
        const debtsService = this.injector.get(DebtsService);
        void debtsService.load();
      } catch {}
    } catch (error) {
      console.error('Failed to delete transaction', error);
      // Revert state if backend request fails
      this._transactions.update((list) => [removed, ...list]);
      this._stats.update((list) => [removed, ...list]);
      this.applyToTotals(removed, +1);
      throw error;
    }
  }

  async loadOpeningBalance(): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this._openingBalance.set(null);
      return;
    }

    try {
      const rows = await firstValueFrom(
        this.api.get<{ amount: number; direction: TxDirection }[]>(
          '/transactions/opening-balance',
        ),
      );

      if (rows.length > 0) {
        const primary = rows[0];
        const amt = Number(primary.amount);
        this._openingBalance.set(primary.direction === 'in' ? amt : -amt);
      } else {
        this._openingBalance.set(null);
      }
    } catch {
      this._openingBalance.set(null);
    }
  }

  async setOpeningBalance(amount: number): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const direction: TxDirection = amount >= 0 ? 'in' : 'out';
    const absAmount = Math.abs(amount);

    try {
      await firstValueFrom(this.api.post('/transactions/opening-balance', {
        amount: absAmount,
        occurred_on: todayIso(),
      }));

      await this.refresh();
    } catch (error) {
      console.error('Failed to set opening balance', error);
      throw error;
    }
  }

  async categorize(id: string, categoryId: string | null): Promise<Transaction> {
    try {
      const created = await firstValueFrom(
        this.api.patch<TransactionResponse>(`/transactions/${id}/categorize`, {
          category_id: categoryId,
        } as CategorizeRequest),
      );
      return created as Transaction;
    } catch (error) {
      console.error('Failed to categorize transaction', error);
      throw error;
    }
  }

  private applyToTotals(tx: Transaction, sign: 1 | -1): void {
    const amt = Number(tx.amount) * sign;
    this._balance.update((b) => (tx.direction === 'in' ? b + amt : b - amt));
  }
}
