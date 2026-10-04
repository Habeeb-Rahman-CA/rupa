import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Debt, DebtDirection, PaymentMode, Transaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { isGreaterCurrency } from '../../shared/utils/currency-utils';

export type DebtTransactionImpact = 'default' | 'income' | 'expense' | 'none';

export interface CreateDebtInput {
  person_id: string;
  direction: DebtDirection;
  amount: number;
  reason?: string | null;
  opened_on?: string; // ISO
  impact?: DebtTransactionImpact;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
}

export interface AddPaymentInput {
  debt_id: string;
  amount: number;
  paid_on?: string; // ISO
  notes?: string | null;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DebtsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly txService = inject(TransactionsService);

  private readonly _debts = signal<Debt[]>([]);
  private readonly _isLoading = signal(false);

  readonly debts = this._debts.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  readonly openDebts = computed(() =>
    this._debts().filter((d) => Number(d.outstanding) > 0),
  );

  readonly theyOweYouTotal = computed(() =>
    this.openDebts()
      .filter((d) => d.direction === 'they_owe')
      .reduce((sum, d) => sum + Number(d.outstanding), 0),
  );

  readonly youOweTotal = computed(() =>
    this.openDebts()
      .filter((d) => d.direction === 'i_owe')
      .reduce((sum, d) => sum + Number(d.outstanding), 0),
  );

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._debts.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._debts.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('debts')
          .select('*')
          .order('opened_on', { ascending: false });

        if (error) {
          console.error('Failed to load debts', error);
          return;
        }
        this._debts.set((data ?? []) as Debt[]);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Creates a debt with configurable income/expense transaction impact.
   * If impact is 'none', no cashflow transaction is created (opening balance).
   */
  async create(input: CreateDebtInput): Promise<Debt> {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    const ownerId = this.requireUserId();
    const openedOn = input.opened_on ?? todayIso();
    const impact = input.impact ?? 'default';

    let txDirection: 'in' | 'out' | null = null;
    if (impact === 'income') {
      txDirection = 'in';
    } else if (impact === 'expense') {
      txDirection = 'out';
    } else if (impact === 'default') {
      txDirection = input.direction === 'i_owe' ? 'in' : 'out';
    } else if (impact === 'none') {
      txDirection = null;
    }

    // 1. Create initial transaction if required
    let tx: Transaction | null = null;
    if (txDirection) {
      tx = await this.txService.create({
        amount: input.amount,
        direction: txDirection,
        occurred_on: openedOn,
        notes: input.reason?.trim() || null,
        source: 'debt',
        payment_mode: input.payment_mode ?? 'cash',
        bank_account_id: input.bank_account_id ?? null,
      });
    }

    // 2. Create the debt row
    const { data, error } = await this.supabase.client
      .from('debts')
      .insert({
        owner_id: ownerId,
        person_id: input.person_id,
        direction: input.direction,
        principal: input.amount,
        outstanding: input.amount,
        reason: input.reason?.trim() || null,
        opened_on: openedOn,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to create debt', error);
      if (tx) {
        await this.safeDeleteTx(tx.id);
      }
      throw error;
    }

    const debt = data as Debt;
    // Link transaction back to debt if created
    if (tx) {
      const { error: linkErr } = await this.supabase.client
        .from('transactions')
        .update({ source_ref_id: debt.id })
        .eq('id', tx.id);
      if (linkErr) {
        console.error('Failed to link transaction to debt, rolling back', linkErr);
        try {
          await this.supabase.client.from('debts').delete().eq('id', debt.id);
        } catch {}
        await this.safeDeleteTx(tx.id);
        throw linkErr;
      }
    }

    this._debts.update((list) => [debt, ...list]);
    await this.txService.refresh();
    return debt;
  }

  /**
   * Add a payment against a debt.
   *   Paying an 'i_owe' debt    → 'out' transaction (YOU pay them back)
   *   Receiving on 'they_owe'   → 'in' transaction  (they pay YOU back)
   * Updates outstanding; closes the debt if outstanding hits 0.
   */
  async addPayment(input: AddPaymentInput): Promise<void> {
    if (!(input.amount > 0)) throw new Error('Payment must be greater than zero.');
    const debt = this._debts().find((d) => d.id === input.debt_id);
    if (!debt) throw new Error('Debt not found.');
    if (isGreaterCurrency(input.amount, Number(debt.outstanding))) {
      throw new Error('Payment is larger than the outstanding amount.');
    }

    const paidOn = input.paid_on ?? todayIso();

    // 1. Transaction
    const txDirection = debt.direction === 'i_owe' ? 'out' : 'in';
    const tx = await this.txService.create({
      amount: input.amount,
      direction: txDirection,
      occurred_on: paidOn,
      notes: input.notes?.trim() || null,
      source: 'debt',
      source_ref_id: debt.id,
      payment_mode: input.payment_mode ?? 'cash',
      bank_account_id: input.bank_account_id ?? null,
    });

    // 2. debt_payment row
    const { error: payErr } = await this.supabase.client.from('debt_payments').insert({
      debt_id: debt.id,
      amount: input.amount,
      paid_on: paidOn,
      transaction_id: tx.id,
      notes: input.notes?.trim() || null,
    });
    if (payErr) {
      console.error('Failed to record debt payment, rolling back transaction', payErr);
      await this.safeDeleteTx(tx.id);
      throw payErr;
    }

    // 3. Update outstanding (and close if 0)
    const newOutstanding = round2(Number(debt.outstanding) - input.amount);
    const patch: Partial<Debt> = { outstanding: newOutstanding };
    if (newOutstanding <= 0) patch.closed_on = paidOn;

    const { data: updated, error: updErr } = await this.supabase.client
      .from('debts')
      .update(patch)
      .eq('id', debt.id)
      .select()
      .single();
    if (updErr) {
      console.error('Failed to update debt outstanding, rolling back payment & transaction', updErr);
      try {
        await this.supabase.client.from('debt_payments').delete().eq('transaction_id', tx.id);
      } catch {}
      await this.safeDeleteTx(tx.id);
      throw updErr;
    }

    this._debts.update((list) =>
      list.map((d) => (d.id === debt.id ? (updated as Debt) : d)),
    );
    await this.txService.refresh();
  }

  async delete(id: string): Promise<void> {
    const currentList = this._debts();
    const index = currentList.findIndex((d) => d.id === id);
    if (index === -1) return;
    const debt = currentList[index];

    // 1. Optimistic removal from signal for immediate UI update
    this._debts.update((list) => list.filter((d) => d.id !== id));

    // 2. Fetch linked transactions
    const { data: txRows } = await this.supabase.client
      .from('transactions')
      .select('id')
      .eq('source', 'debt')
      .eq('source_ref_id', id);

    // 3. Delete linked transactions first so we don't orphan transactions if deletion fails
    for (const row of txRows ?? []) {
      try {
        await this.txService.delete(row.id);
      } catch (err) {
        console.error(`Failed to delete transaction ${row.id} linked to debt ${id}`, err);
        // Revert signal update on failure
        this._debts.update((list) => {
          if (list.some((d) => d.id === id)) return list;
          const restored = [...list];
          restored.splice(Math.min(index, restored.length), 0, debt);
          return restored;
        });
        throw err;
      }
    }

    // 4. Delete debt row
    const { error } = await this.supabase.client.from('debts').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete debt', error);
      // Revert signal update on failure
      this._debts.update((list) => {
        if (list.some((d) => d.id === id)) return list;
        const restored = [...list];
        restored.splice(Math.min(index, restored.length), 0, debt);
        return restored;
      });
      throw error;
    }

    await this.txService.refresh();
  }

  private async safeDeleteTx(txId: string): Promise<void> {
    try {
      await this.txService.delete(txId);
    } catch (err) {
      console.error(`Rollback warning: Failed to delete transaction ${txId} via service, attempting direct DB cleanup`, err);
      try {
        await this.supabase.client.from('transactions').delete().eq('id', txId);
        await this.txService.refresh();
      } catch (fallbackErr) {
        console.error(`Rollback error: Final fallback cleanup for transaction ${txId} failed`, fallbackErr);
      }
    }
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
