import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { Transaction, TxDirection, PaymentMode, isSavingsCategory } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { CategoriesService } from './categories.service';
import { DebtsService } from './debts.service';
import { BankAccountsService } from './bank-accounts.service';
import { OfflineQueueService, OfflineAction, OfflineActionType } from './offline-queue.service';

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

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly injector = inject(Injector);
  private readonly offlineQueue = inject(OfflineQueueService);

  private readonly _transactions = signal<Transaction[]>([]);
  private readonly _balance = signal<number>(0);
  private readonly _openingBalance = signal<number | null>(null);
  private readonly _isLoading = signal(false);

  readonly transactions = this._transactions.asReadonly();
  readonly balance = this._balance.asReadonly();
  readonly openingBalance = this._openingBalance.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  readonly monthly = computed<MonthlyStats>(() => {
    const txs = this._transactions();
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
    const txs = this._transactions();
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

    // Register offline-sync handler for the transactions table.
    this.offlineQueue.registerHandler('transactions', async (action) => {
      const p = action.payload as Record<string, unknown>;
      if (action.type === 'create') {
        const { data, error } = await this.supabase.client.rpc(
          'create_transaction_with_balance_update',
          {
            p_owner_id: p['owner_id'] as string,
            p_amount: Number(p['amount']),
            p_direction: p['direction'] as TxDirection,
            p_occurred_on: p['occurred_on'] as string,
            p_category_id: p['category_id'] as string | null,
            p_notes: p['notes'] as string | null,
            p_source: p['source'] as string,
            p_source_ref_id: p['source_ref_id'] as string | null,
            p_payment_mode: p['payment_mode'] as PaymentMode,
            p_bank_account_id: p['bank_account_id'] as string | null,
          },
        );
        if (error) throw error;
        const created = (data as Transaction[])?.[0];
        if (!created) throw new Error('Transaction was not returned after sync.');
        // Replace the optimistic local entry with the server version.
        this._transactions.update((list) => list.map((t) => (t.id === p['localId'] ? created : t)));
      } else if (action.type === 'delete') {
        const { error } = await this.supabase.client.rpc('delete_transaction_with_balance_update', {
          p_transaction_id: p['id'] as string,
        });
        if (error) throw error;
        this._transactions.update((list) => list.filter((t) => t.id !== p['id']));
      }
    });
  }

  async mapUnassignedTransactionsToPrimary(bankAccountId: string): Promise<void> {
    const current = this._transactions();
    // Only bank-mode transactions are eligible for migration. Older cash
    // transactions have no bank_account_id by design and must not be silently
    // reassigned to a newly-created primary account.
    const unassigned = current.filter((t) => t.payment_mode === 'bank' && !t.bank_account_id);
    if (unassigned.length === 0) return;

    const updatedList = current.map((t) => {
      if (t.payment_mode === 'bank' && !t.bank_account_id) {
        return {
          ...t,
          bank_account_id: bankAccountId,
        };
      }
      return t;
    });

    this._transactions.set(updatedList);

    const unassignedIds = unassigned.map((t) => t.id);
    try {
      const { error: mapErr } = await this.supabase.client.rpc('assign_transactions_to_account', {
        p_account_id: bankAccountId,
        p_transaction_ids: unassignedIds,
      });
      if (mapErr) {
        console.error('Failed to map bank transactions to the primary account', mapErr);
      }
    } catch {
      console.error('Failed to map bank transactions to the primary account');
    }
  }

  private refreshPromise: Promise<void> | null = null;

  async refresh(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._transactions.set([]);
      this._balance.set(0);
      this._openingBalance.set(null);
      return;
    }
    if (this.refreshPromise) return this.refreshPromise;

    this._isLoading.set(true);
    this.refreshPromise = (async () => {
      try {
        await Promise.all([this.loadTransactions(), this.loadBalance(), this.loadOpeningBalance()]);
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

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');

    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    let targetBankAccountId = input.bank_account_id ?? null;
    let mode = input.payment_mode ?? 'cash';

    if (mode === 'bank' && !targetBankAccountId) {
      try {
        const bankAccountsService = this.injector.get(BankAccountsService);
        const primary = bankAccountsService.primaryAccount();
        if (primary) {
          targetBankAccountId = primary.id;
        }
      } catch {}
    }

    const occurredOn = input.occurred_on ?? todayIso();

    // Offline path: enqueue for later sync and apply optimistically to local state.
    if (!this.offlineQueue.isOnline()) {
      const localId = `local_${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
      const optimistic: Transaction = {
        id: localId,
        owner_id: ownerId,
        occurred_on: occurredOn,
        amount: input.amount,
        direction: input.direction,
        category_id: input.category_id ?? null,
        notes: input.notes?.trim() || null,
        source: input.source ?? ('manual' as const),
        source_ref_id: input.source_ref_id ?? null,
        payment_mode: mode,
        bank_account_id: targetBankAccountId,
        created_at: new Date().toISOString(),
      };

      await this.offlineQueue.enqueue({
        type: 'create',
        table: 'transactions',
        payload: {
          ...input,
          localId,
          owner_id: ownerId,
          occurred_on: occurredOn,
          amount: input.amount,
          direction: input.direction,
          category_id: input.category_id ?? null,
          notes: input.notes?.trim() || null,
          source: input.source ?? ('manual' as const),
          source_ref_id: input.source_ref_id ?? null,
          payment_mode: mode,
          bank_account_id: targetBankAccountId,
        },
      });

      this._transactions.update((list) => [optimistic, ...list]);
      this.applyToTotals(optimistic, +1);
      return optimistic;
    }

    const { data, error } = await this.supabase.client.rpc(
      'create_transaction_with_balance_update',
      {
        p_owner_id: ownerId,
        p_amount: input.amount,
        p_direction: input.direction,
        p_occurred_on: occurredOn,
        p_category_id: input.category_id ?? null,
        p_notes: input.notes?.trim() || null,
        p_source: input.source ?? ('manual' as const),
        p_source_ref_id: input.source_ref_id ?? null,
        p_payment_mode: mode,
        p_bank_account_id: targetBankAccountId,
      },
    );

    if (error) {
      console.error('Failed to create transaction', error);
      throw error;
    }

    const created = (data as Transaction[])?.[0];
    if (!created) {
      throw new Error('Transaction was not returned after creation.');
    }

    this._transactions.update((list) => [created, ...list]);
    this.applyToTotals(created, +1);
    return created;
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
    this.applyToTotals(removed, -1);

    // Offline path: enqueue for later sync, skip online-only debt_payment cleanup.
    if (!this.offlineQueue.isOnline()) {
      await this.offlineQueue.enqueue({
        type: 'delete',
        table: 'transactions',
        payload: {
          id,
          payment_mode: removed.payment_mode,
          bank_account_id: removed.bank_account_id,
          direction: removed.direction,
          amount: Number(removed.amount),
        },
      });
      return;
    }

    try {
      // Clean up debt_payments referencing this transaction if any
      const { data: debtPayments } = await this.supabase.client
        .from('debt_payments')
        .select('id, debt_id, amount')
        .eq('transaction_id', id);

      if (debtPayments && debtPayments.length > 0) {
        for (const dp of debtPayments) {
          await this.supabase.client.from('debt_payments').delete().eq('id', dp.id);
          // Restore debt balance based on ground-truth principal minus remaining payments
          const { data: debt } = await this.supabase.client
            .from('debts')
            .select('principal')
            .eq('id', dp.debt_id)
            .maybeSingle();

          if (debt) {
            const { data: remainingPayments } = await this.supabase.client
              .from('debt_payments')
              .select('amount')
              .eq('debt_id', dp.debt_id);

            const totalPaid = (remainingPayments ?? []).reduce(
              (sum, p) => sum + Number(p.amount),
              0,
            );
            const restoredOutstanding = Math.max(
              0,
              Math.round((Number(debt.principal) - totalPaid + Number.EPSILON) * 100) / 100,
            );
            const patch: Record<string, unknown> = { outstanding: restoredOutstanding };
            if (restoredOutstanding > 0) {
              patch['closed_on'] = null;
            }

            await this.supabase.client.from('debts').update(patch).eq('id', dp.debt_id);
          }
        }
      }

      // Atomic delete: reverts bank balance and removes the transaction row
      // in the same database transaction.
      const { error: delErr } = await this.supabase.client.rpc(
        'delete_transaction_with_balance_update',
        { p_transaction_id: id },
      );

      if (delErr) throw delErr;

      // Refresh DebtsService if present
      try {
        const debtsService = this.injector.get(DebtsService);
        void debtsService.load();
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

    const { data, error } = await this.supabase.client
      .from('transactions')
      .select('amount, direction')
      .eq('owner_id', ownerId)
      .or('source.eq.opening,notes.eq.Opening balance')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const primary = data[0];
      const amt = Number(primary.amount);
      this._openingBalance.set(primary.direction === 'in' ? amt : -amt);
    } else {
      this._openingBalance.set(null);
    }
  }

  async setOpeningBalance(amount: number): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    // Query all matching opening balance transactions without .maybeSingle() to prevent PGRST116 exceptions
    const { data: matches, error: findErr } = await this.supabase.client
      .from('transactions')
      .select('id')
      .eq('owner_id', ownerId)
      .or('source.eq.opening,notes.eq.Opening balance')
      .order('created_at', { ascending: false });

    if (findErr) throw findErr;

    const direction: TxDirection = amount >= 0 ? 'in' : 'out';
    const absAmount = Math.abs(amount);
    const existingList = matches ?? [];

    if (existingList.length > 0) {
      const primaryId = existingList[0].id;

      // Clean up any extra duplicate opening balance records if user rapidly clicked or previous duplicates existed
      if (existingList.length > 1) {
        const extraIds = existingList.slice(1).map((r) => r.id);
        await this.supabase.client.from('transactions').delete().in('id', extraIds);
      }

      if (absAmount === 0 && amount === 0) {
        await this.supabase.client.from('transactions').delete().eq('id', primaryId);
      } else {
        const { error: updErr } = await this.supabase.client
          .from('transactions')
          .update({
            amount: absAmount,
            direction,
            occurred_on: todayIso(),
            source: 'opening',
            notes: 'Opening balance',
          })
          .eq('id', primaryId);
        if (updErr) throw updErr;
      }
    } else if (absAmount > 0) {
      const { error: insErr } = await this.supabase.client.from('transactions').insert({
        owner_id: ownerId,
        amount: absAmount,
        direction,
        occurred_on: todayIso(),
        notes: 'Opening balance',
        source: 'opening',
      });
      if (insErr) throw insErr;
    }

    await this.refresh();
  }

  private applyToTotals(tx: Transaction, sign: 1 | -1): void {
    const amt = Number(tx.amount) * sign;
    this._balance.update((b) => (tx.direction === 'in' ? b + amt : b - amt));
  }
}

// -------- helpers -----------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
