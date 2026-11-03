import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AccountTransfer } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { roundCurrency } from '../../shared/utils/currency-utils';

export interface AccountTransferInput {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  occurred_on?: string;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TransfersService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly transactionsService = inject(TransactionsService);

  private readonly _transfers = signal<AccountTransfer[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  readonly transfers = this._transfers.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();
  readonly transferCount = computed(() => this._transfers().length);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._transfers.set([]);
        this._isAvailable.set(true);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._transfers.set([]);
      return;
    }
    if (!this._isAvailable()) return;
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('transfers')
          .select('*')
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) {
          if (this.handleMissingSchema(error)) return;
          console.error('Failed to load account transfers', error);
          return;
        }

        this._transfers.set((data ?? []).map((row) => this.normalizeTransfer(row)));
      } catch (error) {
        console.error('Failed to load account transfers', error);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(input: AccountTransferInput): Promise<AccountTransfer> {
    this.ensureAvailable();
    this.validateInput(input);

    const { data, error } = await this.supabase.client.rpc('create_account_transfer', {
      p_source_account_id: input.source_account_id,
      p_destination_account_id: input.destination_account_id,
      p_amount: roundCurrency(input.amount),
      p_occurred_on: input.occurred_on ?? todayIso(),
      p_notes: input.notes?.trim() || null,
    });

    if (error) throw error;
    const created = this.firstTransfer(data);
    if (!created) throw new Error('The transfer was not returned after saving.');

    this._transfers.update((list) => [created, ...list]);
    await this.refreshDependents();
    return created;
  }

  async update(id: string, input: AccountTransferInput): Promise<AccountTransfer> {
    this.ensureAvailable();
    const current = this._transfers().find((transfer) => transfer.id === id);
    if (!current) throw new Error('Transfer not found.');
    this.validateInput(input, current);

    const { data, error } = await this.supabase.client.rpc('update_account_transfer', {
      p_transfer_id: id,
      p_source_account_id: input.source_account_id,
      p_destination_account_id: input.destination_account_id,
      p_amount: roundCurrency(input.amount),
      p_occurred_on: input.occurred_on ?? todayIso(),
      p_notes: input.notes?.trim() || null,
    });

    if (error) throw error;
    const updated = this.firstTransfer(data);
    if (!updated) throw new Error('The transfer was not returned after updating.');

    this._transfers.update((list) => list.map((item) => (item.id === id ? updated : item)));
    await this.refreshDependents();
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.ensureAvailable();
    const current = this._transfers().find((transfer) => transfer.id === id);
    if (!current) return;

    const { error } = await this.supabase.client.rpc('delete_account_transfer', {
      p_transfer_id: id,
    });
    if (error) throw error;

    this._transfers.update((list) => list.filter((item) => item.id !== id));
    await this.refreshDependents();
  }

  private validateInput(input: AccountTransferInput, current?: AccountTransfer): void {
    if (!input.source_account_id || !input.destination_account_id) {
      throw new Error('Source and destination accounts are required.');
    }
    if (input.source_account_id === input.destination_account_id) {
      throw new Error('Source and destination accounts must be different.');
    }

    const amount = roundCurrency(Number(input.amount));
    if (!(amount > 0)) throw new Error('Transfer amount must be greater than zero.');

    const source = this.bankAccountsService
      .bankAccounts()
      .find((account) => account.id === input.source_account_id);
    if (!source) throw new Error('Source account not found.');

    const balance = Number(source.balance ?? 0);
    let balanceAdjustment = 0;
    if (current?.source_account_id === input.source_account_id) {
      balanceAdjustment += Number(current.amount);
    }
    if (current?.destination_account_id === input.source_account_id) {
      balanceAdjustment -= Number(current.amount);
    }
    if (balance + balanceAdjustment + 0.000001 < amount) {
      throw new Error('Insufficient balance in the source account.');
    }
  }

  private async refreshDependents(): Promise<void> {
    await Promise.all([
      this.bankAccountsService.load(),
      this.transactionsService.refresh(),
    ]);
  }

  private ensureAvailable(): void {
    if (!this._isAvailable()) {
      throw new Error('Transfers setup is unavailable. Apply database migration 0009 first.');
    }
  }

  private handleMissingSchema(error: { code?: string; message?: string }): boolean {
    const message = error.message?.toLowerCase() ?? '';
    if (
      error.code !== 'PGRST205' &&
      error.code !== '42P01' &&
      !message.includes('could not find the table')
    ) {
      return false;
    }
    this._isAvailable.set(false);
    return true;
  }

  private firstTransfer(data: unknown): AccountTransfer | null {
    if (!data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row && typeof row === 'object' ? this.normalizeTransfer(row as Record<string, unknown>) : null;
  }

  private normalizeTransfer(row: Record<string, unknown>): AccountTransfer {
    return {
      id: String(row['id']),
      owner_id: String(row['owner_id']),
      source_account_id: String(row['source_account_id']),
      destination_account_id: String(row['destination_account_id']),
      amount: Number(row['amount']),
      occurred_on: String(row['occurred_on']),
      notes: typeof row['notes'] === 'string' ? row['notes'] : null,
      debit_transaction_id: String(row['debit_transaction_id']),
      credit_transaction_id: String(row['credit_transaction_id']),
      created_at: String(row['created_at']),
    };
  }
}

function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
