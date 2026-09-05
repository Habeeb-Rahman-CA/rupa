import { Injectable, Injector, effect, inject, signal } from '@angular/core';
import { Transaction, TxDirection } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DebtsService } from './debts.service';
import { EventsService } from './events.service';

export interface CreateTransactionInput {
  amount: number;
  direction: TxDirection;
  occurred_on?: string; // ISO date; defaults to today
  category_id?: string | null;
  notes?: string | null;
}

export interface MonthlyStats {
  spent: number;
  received: number;
}

const emptyStats: MonthlyStats = { spent: 0, received: 0 };

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly _transactions = signal<Transaction[]>([]);
  private readonly _balance = signal<number>(0);
  private readonly _monthly = signal<MonthlyStats>(emptyStats);
  private readonly _openingBalance = signal<number | null>(null);
  private readonly _isLoading = signal(false);

  readonly transactions = this._transactions.asReadonly();
  readonly balance = this._balance.asReadonly();
  readonly monthly = this._monthly.asReadonly();
  readonly openingBalance = this._openingBalance.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.refresh();
      } else {
        this._transactions.set([]);
        this._balance.set(0);
        this._monthly.set(emptyStats);
        this._openingBalance.set(null);
      }
    });
  }

  private refreshPromise: Promise<void> | null = null;

  async refresh(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._transactions.set([]);
      this._balance.set(0);
      this._monthly.set(emptyStats);
      this._openingBalance.set(null);
      return;
    }
    if (this.refreshPromise) return this.refreshPromise;

    this._isLoading.set(true);
    this.refreshPromise = (async () => {
      try {
        await Promise.all([
          this.loadTransactions(),
          this.loadBalance(),
          this.loadMonthly(),
          this.loadOpeningBalance(),
        ]);
      } finally {
        this._isLoading.set(false);
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async loadTransactions(limit = 200): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('transactions')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Failed to load transactions', error);
      return;
    }
    this._transactions.set((data ?? []) as Transaction[]);
  }

  async loadBalance(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('account_balance')
      .select('balance')
      .maybeSingle();
    if (error) {
      console.error('Failed to load balance', error);
      return;
    }
    this._balance.set(Number(data?.balance ?? 0));
  }

  async loadMonthly(): Promise<void> {
    const { start, end } = monthBounds(new Date());
    const { data, error } = await this.supabase.client
      .from('transactions')
      .select('amount, direction')
      .gte('occurred_on', start)
      .lt('occurred_on', end);
    if (error) {
      console.error('Failed to load monthly stats', error);
      return;
    }

    let spent = 0;
    let received = 0;
    for (const row of data ?? []) {
      const amt = Number(row.amount);
      if (row.direction === 'out') spent += amt;
      else if (row.direction === 'in') received += amt;
    }
    this._monthly.set({ spent, received });
  }

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');

    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const payload = {
      owner_id: ownerId,
      amount: input.amount,
      direction: input.direction,
      occurred_on: input.occurred_on ?? todayIso(),
      category_id: input.category_id ?? null,
      notes: input.notes?.trim() || null,
      source: 'manual' as const,
    };

    const { data, error } = await this.supabase.client
      .from('transactions')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('Failed to create transaction', error);
      throw error;
    }

    const created = data as Transaction;
    this._transactions.update((list) => [created, ...list]);
    this.applyToTotals(created, +1);
    return created;
  }

  async delete(id: string): Promise<void> {
    const removed = this._transactions().find((t) => t.id === id);
    if (!removed) return;

    // 1. Optimistic removal from state for immediate UI feedback
    this._transactions.update((list) => list.filter((t) => t.id !== id));
    this.applyToTotals(removed, -1);

    try {
      // Clean up debt_payments referencing this transaction if any
      const { data: debtPayments } = await this.supabase.client
        .from('debt_payments')
        .select('id, debt_id, amount')
        .eq('transaction_id', id);

      if (debtPayments && debtPayments.length > 0) {
        for (const dp of debtPayments) {
          await this.supabase.client.from('debt_payments').delete().eq('id', dp.id);
          // Restore debt balance
          const { data: debt } = await this.supabase.client
            .from('debts')
            .select('outstanding')
            .eq('id', dp.debt_id)
            .maybeSingle();

          if (debt) {
            const restored = Math.round((Number(debt.outstanding) + Number(dp.amount)) * 100) / 100;
            await this.supabase.client
              .from('debts')
              .update({ outstanding: restored, closed_on: null })
              .eq('id', dp.debt_id);
          }
        }
      }

      // Clean up event_expenses referencing this transaction if any
      const { data: eventExpenses } = await this.supabase.client
        .from('event_expenses')
        .select('id')
        .eq('transaction_id', id);

      if (eventExpenses && eventExpenses.length > 0) {
        for (const ee of eventExpenses) {
          await this.supabase.client.from('event_expenses').delete().eq('id', ee.id);
        }
      }

      // Clean up event_settlements referencing this transaction if any
      const { data: eventSettlements } = await this.supabase.client
        .from('event_settlements')
        .select('id')
        .eq('transaction_id', id);

      if (eventSettlements && eventSettlements.length > 0) {
        for (const es of eventSettlements) {
          await this.supabase.client.from('event_settlements').delete().eq('id', es.id);
        }
      }

      // Delete transaction row
      const { error } = await this.supabase.client
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Refresh DebtsService & EventsService if present
      try {
        const debtsService = this.injector.get(DebtsService);
        void debtsService.load();
      } catch {}
      try {
        const eventsService = this.injector.get(EventsService);
        void eventsService.loadList();
      } catch {}
    } catch (error) {
      console.error('Failed to delete transaction', error);
      // Revert state if backend request fails
      this._transactions.update((list) => [removed, ...list]);
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

    const { data } = await this.supabase.client
      .from('transactions')
      .select('amount, direction')
      .eq('owner_id', ownerId)
      .eq('notes', 'Opening balance')
      .maybeSingle();

    if (data) {
      const amt = Number(data.amount);
      this._openingBalance.set(data.direction === 'in' ? amt : -amt);
    } else {
      this._openingBalance.set(null);
    }
  }

  async setOpeningBalance(amount: number): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const { data: existing } = await this.supabase.client
      .from('transactions')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('notes', 'Opening balance')
      .maybeSingle();

    const direction: TxDirection = amount >= 0 ? 'in' : 'out';
    const absAmount = Math.abs(amount);

    if (existing) {
      if (absAmount === 0 && amount === 0) {
        await this.supabase.client.from('transactions').delete().eq('id', existing.id);
      } else {
        const { error } = await this.supabase.client
          .from('transactions')
          .update({
            amount: absAmount,
            direction,
            occurred_on: '2000-01-01',
          })
          .eq('id', existing.id);
        if (error) throw error;
      }
    } else {
      if (absAmount > 0) {
        const { error } = await this.supabase.client
          .from('transactions')
          .insert({
            owner_id: ownerId,
            amount: absAmount,
            direction,
            occurred_on: '2000-01-01',
            notes: 'Opening balance',
            source: 'manual',
          });
        if (error) throw error;
      }
    }

    await this.refresh();
  }

  private applyToTotals(tx: Transaction, sign: 1 | -1): void {
    const amt = Number(tx.amount) * sign;
    this._balance.update((b) => (tx.direction === 'in' ? b + amt : b - amt));

    if (isInCurrentMonth(tx.occurred_on)) {
      this._monthly.update((m) =>
        tx.direction === 'in'
          ? { ...m, received: m.received + amt }
          : { ...m, spent: m.spent + amt },
      );
    }
  }
}

// -------- helpers -----------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(date: Date): { start: string; end: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isInCurrentMonth(iso: string): boolean {
  const now = new Date();
  const [y, m] = iso.split('-').map(Number);
  return y === now.getFullYear() && m === now.getMonth() + 1;
}
