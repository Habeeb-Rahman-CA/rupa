import { Injectable, effect, inject, signal } from '@angular/core';
import { Transaction, TxDirection } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

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

  private readonly _transactions = signal<Transaction[]>([]);
  private readonly _balance = signal<number>(0);
  private readonly _monthly = signal<MonthlyStats>(emptyStats);
  private readonly _isLoading = signal(false);

  readonly transactions = this._transactions.asReadonly();
  readonly balance = this._balance.asReadonly();
  readonly monthly = this._monthly.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.refresh();
      } else {
        this._transactions.set([]);
        this._balance.set(0);
        this._monthly.set(emptyStats);
      }
    });
  }

  async refresh(): Promise<void> {
    this._isLoading.set(true);
    await Promise.all([
      this.loadTransactions(),
      this.loadBalance(),
      this.loadMonthly(),
    ]);
    this._isLoading.set(false);
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
    const { error } = await this.supabase.client
      .from('transactions')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Failed to delete transaction', error);
      throw error;
    }
    this._transactions.update((list) => list.filter((t) => t.id !== id));
    if (removed) this.applyToTotals(removed, -1);
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
