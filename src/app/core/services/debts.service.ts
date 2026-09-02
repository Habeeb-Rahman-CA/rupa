import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Debt, DebtDirection, Transaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';

export interface CreateDebtInput {
  person_id: string;
  direction: DebtDirection;
  amount: number;
  reason?: string | null;
  opened_on?: string; // ISO
}

export interface AddPaymentInput {
  debt_id: string;
  amount: number;
  paid_on?: string; // ISO
  notes?: string | null;
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

  async load(): Promise<void> {
    this._isLoading.set(true);
    const { data, error } = await this.supabase.client
      .from('debts')
      .select('*')
      .order('opened_on', { ascending: false });
    this._isLoading.set(false);
    if (error) {
      console.error('Failed to load debts', error);
      return;
    }
    this._debts.set((data ?? []) as Debt[]);
  }

  /**
   * Creates a debt and its linked initial transaction.
   *   direction 'i_owe'    → someone gave YOU money → 'in' transaction
   *   direction 'they_owe' → YOU gave someone money → 'out' transaction
   */
  async create(input: CreateDebtInput): Promise<Debt> {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    const ownerId = this.requireUserId();
    const openedOn = input.opened_on ?? todayIso();

    // 1. Create the initial transaction
    const txDirection = input.direction === 'i_owe' ? 'in' : 'out';
    const tx = await this.insertTransaction({
      owner_id: ownerId,
      amount: input.amount,
      direction: txDirection,
      occurred_on: openedOn,
      notes: input.reason?.trim() || null,
      source: 'debt',
    });

    // 2. Create the debt, referencing the transaction
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
      console.error('Failed to create debt (transaction already saved)', error);
      // Roll back the transaction we just made so balance stays right
      await this.txService.delete(tx.id).catch(() => undefined);
      throw error;
    }

    const debt = data as Debt;
    // Link the transaction back to the debt for traceability
    await this.supabase.client
      .from('transactions')
      .update({ source_ref_id: debt.id })
      .eq('id', tx.id);

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
    if (input.amount > Number(debt.outstanding) + 0.001) {
      throw new Error('Payment is larger than the outstanding amount.');
    }

    const ownerId = this.requireUserId();
    const paidOn = input.paid_on ?? todayIso();

    // 1. Transaction
    const txDirection = debt.direction === 'i_owe' ? 'out' : 'in';
    const tx = await this.insertTransaction({
      owner_id: ownerId,
      amount: input.amount,
      direction: txDirection,
      occurred_on: paidOn,
      notes: input.notes?.trim() || null,
      source: 'debt',
      source_ref_id: debt.id,
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
      console.error('Failed to record debt payment', payErr);
      await this.txService.delete(tx.id).catch(() => undefined);
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
      console.error('Failed to update debt outstanding', updErr);
      throw updErr;
    }

    this._debts.update((list) =>
      list.map((d) => (d.id === debt.id ? (updated as Debt) : d)),
    );
    await this.txService.refresh();
  }

  async delete(id: string): Promise<void> {
    // Deleting a debt also deletes its debt_payments (FK cascade),
    // but the linked transactions do NOT cascade — those remain in the ledger.
    // Remove them explicitly so the balance stays consistent with what the
    // user sees on the Debts page.
    const { data: txRows } = await this.supabase.client
      .from('transactions')
      .select('id')
      .eq('source', 'debt')
      .eq('source_ref_id', id);

    const { error } = await this.supabase.client.from('debts').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete debt', error);
      throw error;
    }

    for (const row of txRows ?? []) {
      await this.supabase.client.from('transactions').delete().eq('id', row.id);
    }

    this._debts.update((list) => list.filter((d) => d.id !== id));
    await this.txService.refresh();
  }

  private async insertTransaction(payload: Record<string, unknown>): Promise<Transaction> {
    const { data, error } = await this.supabase.client
      .from('transactions')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('Failed to insert linked transaction', error);
      throw error;
    }
    return data as Transaction;
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
