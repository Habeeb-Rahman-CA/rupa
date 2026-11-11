import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { BankAccountsService } from './bank-accounts.service';
import { AuthService } from './auth.service';
import { CategoriesService } from './categories.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { CardTheme, PaymentMode, Wallet, WalletTransaction, WalletTransactionKind } from '../models/domain.models';
import { roundCurrency } from '../../shared/utils/currency-utils';
import {
  WALLET_SPENDING_CATEGORY_NAME,
  isWalletSpendingCategory,
} from '../../shared/utils/category-utils';

export interface CreateWalletInput {
  name: string;
  theme?: CardTheme;
  initial_balance?: number;
  minimum_balance?: number;
}

export interface UpdateWalletInput {
  name?: string;
  theme?: CardTheme;
  minimum_balance?: number;
}

export interface WalletTransactionInput {
  wallet_id: string;
  kind: WalletTransactionKind;
  amount: number;
  idempotency_key?: string;
  occurred_on?: string;
  funding_mode?: PaymentMode | null;
  bank_account_id?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class WalletsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly _wallets = signal<Wallet[]>([]);
  private readonly _transactions = signal<WalletTransaction[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  readonly wallets = this._wallets.asReadonly();
  readonly transactions = this._transactions.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();
  readonly walletCount = computed(() => this._wallets().length);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._wallets.set([]);
        this._transactions.set([]);
        this._isAvailable.set(true);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._wallets.set([]);
      this._transactions.set([]);
      return;
    }
    if (!this._isAvailable()) return;
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [walletResult, transactionResult] = await Promise.all([
          this.supabase.client.from('wallets').select('*').order('created_at', { ascending: false }),
          this.supabase.client
            .from('wallet_transactions')
            .select('*')
            .order('occurred_on', { ascending: false })
            .order('created_at', { ascending: false }),
        ]);

        if (walletResult.error || transactionResult.error) {
          const error = walletResult.error ?? transactionResult.error;
          if (error && this.handleMissingSchema(error)) return;
          console.error('Failed to load wallets', error);
          return;
        }

        this._wallets.set((walletResult.data ?? []).map((row) => this.normalizeWallet(row)));
        this._transactions.set(
          (transactionResult.data ?? []).map((row) => this.normalizeTransaction(row)),
        );
      } catch (error) {
        console.error('Failed to load wallets', error);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(input: CreateWalletInput): Promise<Wallet> {
    this.ensureAvailable();
    const ownerId = this.requireOwnerId();
    const name = input.name.trim();
    const initialBalance = roundCurrency(Number(input.initial_balance ?? 0));
    const minimumBalance = roundCurrency(Number(input.minimum_balance ?? 0));

    if (!name) throw new Error('Wallet name is required.');
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      throw new Error('Initial balance cannot be negative.');
    }
    if (!Number.isFinite(minimumBalance) || minimumBalance < 0) {
      throw new Error('Minimum balance cannot be negative.');
    }

    const { data, error } = await this.supabase.client
      .from('wallets')
      .insert({
        owner_id: ownerId,
        name,
        theme: input.theme ?? 'dark',
        initial_balance: initialBalance,
        balance: initialBalance,
        minimum_balance: minimumBalance,
      })
      .select()
      .single();
    if (error) throw error;

    const wallet = this.normalizeWallet(data);
    this._wallets.update((list) => [wallet, ...list]);
    return wallet;
  }

  async update(id: string, input: UpdateWalletInput): Promise<Wallet> {
    this.ensureAvailable();
    const current = this._wallets().find((wallet) => wallet.id === id);
    if (!current) throw new Error('Wallet not found.');

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('Wallet name is required.');
      changes['name'] = name;
    }
    if (input.theme !== undefined) {
      changes['theme'] = isWalletTheme(input.theme) ? input.theme : 'dark';
    }
    if (input.minimum_balance !== undefined) {
      const minimumBalance = roundCurrency(Number(input.minimum_balance));
      if (!Number.isFinite(minimumBalance) || minimumBalance < 0) {
        throw new Error('Minimum balance cannot be negative.');
      }
      changes['minimum_balance'] = minimumBalance;
    }
    if (Object.keys(changes).length === 0) return current;

    const { data, error } = await this.supabase.client
      .from('wallets')
      .update(changes)
      .eq('id', id)
      .eq('owner_id', this.requireOwnerId())
      .select()
      .single();
    if (error) throw error;

    const wallet = this.normalizeWallet(data);
    this._wallets.update((list) => list.map((item) => (item.id === id ? wallet : item)));
    return wallet;
  }

  async createTransaction(input: WalletTransactionInput): Promise<WalletTransaction> {
    this.ensureAvailable();
    this.validateInput(input);
    const idempotencyKey = input.idempotency_key ?? generateUuid();

    const { data, error } = await this.supabase.client.rpc('create_wallet_transaction', {
      p_request_id: idempotencyKey,
      p_wallet_id: input.wallet_id,
      p_kind: input.kind,
      p_amount: roundCurrency(input.amount),
      p_occurred_on: input.occurred_on ?? todayIso(),
      p_category_id: input.kind === 'spend' ? await this.walletSpendingCategoryId() : null,
      p_funding_mode: input.kind === 'recharge' ? input.funding_mode ?? null : null,
      p_bank_account_id:
        input.kind === 'recharge' && input.funding_mode === 'bank'
          ? input.bank_account_id ?? null
          : null,
      p_notes: input.notes?.trim() || null,
    });
    if (error) throw error;

    const created = this.firstTransaction(data);
    if (!created) throw new Error('The wallet transaction was not returned after saving.');
    this._transactions.update((list) => [created, ...list]);
    await this.refreshDependents();
    return created;
  }

  async updateTransaction(id: string, input: WalletTransactionInput): Promise<WalletTransaction> {
    this.ensureAvailable();
    const current = this._transactions().find((transaction) => transaction.id === id);
    if (!current) throw new Error('Wallet transaction not found.');
    this.validateInput(input, current);

    const { data, error } = await this.supabase.client.rpc('update_wallet_transaction', {
      p_wallet_transaction_id: id,
      p_kind: input.kind,
      p_amount: roundCurrency(input.amount),
      p_occurred_on: input.occurred_on ?? todayIso(),
      p_category_id: input.kind === 'spend' ? await this.walletSpendingCategoryId() : null,
      p_funding_mode: input.kind === 'recharge' ? input.funding_mode ?? null : null,
      p_bank_account_id:
        input.kind === 'recharge' && input.funding_mode === 'bank'
          ? input.bank_account_id ?? null
          : null,
      p_notes: input.notes?.trim() || null,
    });
    if (error) throw error;

    const updated = this.firstTransaction(data);
    if (!updated) throw new Error('The wallet transaction was not returned after updating.');
    this._transactions.update((list) => list.map((item) => (item.id === id ? updated : item)));
    await this.refreshDependents();
    return updated;
  }

  async deleteTransaction(transaction: WalletTransaction): Promise<void> {
    this.ensureAvailable();
    const { error } = await this.supabase.client.rpc('delete_wallet_transaction', {
      p_wallet_transaction_id: transaction.id,
    });
    if (error) throw error;

    this._transactions.update((list) => list.filter((item) => item.id !== transaction.id));
    await this.refreshDependents();
  }

  transactionsFor(walletId: string): WalletTransaction[] {
    return this._transactions().filter((transaction) => transaction.wallet_id === walletId);
  }

  /**
   * Wallet spending is grouped under the system category "Wallet spending"
   * (the sheet shows it pre-selected), so resolve its real id — creating it
   * on first use — instead of saving an uncategorized spend. Recharges never
   * carry a category (the database forbids it).
   */
  private async walletSpendingCategoryId(): Promise<string | null> {
    const findId = (): string | null =>
      this.categoriesService.categories().find((c) => isWalletSpendingCategory(c))?.id ?? null;

    await this.categoriesService.load().catch(() => undefined);
    const existing = findId();
    if (existing) return existing;

    try {
      const created = await this.categoriesService.create(
        WALLET_SPENDING_CATEGORY_NAME,
        'expense',
      );
      return created?.id ?? findId();
    } catch (err) {
      console.error('Could not ensure the Wallet spending category', err);
      // The category may already exist (e.g. created from another tab) —
      // re-read the list and use it before giving up.
      await this.categoriesService.load().catch(() => undefined);
      return findId();
    }
  }

  private validateInput(input: WalletTransactionInput, current?: WalletTransaction): void {
    if (!input.wallet_id) throw new Error('Wallet is required.');
    if (!(roundCurrency(Number(input.amount)) > 0)) {
      throw new Error('Wallet transaction amount must be greater than zero.');
    }
    if (current && current.wallet_id !== input.wallet_id) {
      throw new Error('Wallet cannot be changed after saving.');
    }
    if (current && current.kind !== input.kind) {
      throw new Error('Transaction type cannot be changed after saving.');
    }

    const wallet = this._wallets().find((item) => item.id === input.wallet_id);
    if (!wallet) throw new Error('Wallet not found.');

    if (input.kind === 'spend') {
      const restoredAmount = current?.kind === 'spend' ? Number(current.amount) : 0;
      if (Number(wallet.balance) + restoredAmount + 0.000001 < Number(input.amount)) {
        throw new Error('Insufficient balance in the wallet.');
      }
      return;
    }

    if (!input.funding_mode) throw new Error('Choose cash or a bank account for the recharge.');
    if (input.funding_mode === 'cash' && input.bank_account_id) {
      throw new Error('Cash recharges cannot include a bank account.');
    }
    if (input.funding_mode === 'bank') {
      if (!input.bank_account_id) throw new Error('Choose a bank account for the recharge.');
      const account = this.bankAccountsService
        .bankAccounts()
        .find((item) => item.id === input.bank_account_id);
      const restoredAmount =
        current?.kind === 'recharge' && current.bank_account_id === input.bank_account_id
          ? Number(current.amount)
          : 0;
      if (!account || Number(account.balance ?? 0) + restoredAmount + 0.000001 < Number(input.amount)) {
        throw new Error('Insufficient balance in the selected bank account.');
      }
    }
  }

  private async refreshDependents(): Promise<void> {
    await Promise.all([this.load(), this.bankAccountsService.load(), this.transactionsService.refresh()]);
  }

  private ensureAvailable(): void {
    if (!this._isAvailable()) {
      throw new Error('Wallets setup is unavailable. Apply database migration 0011 first.');
    }
  }

  private requireOwnerId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
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

  private firstTransaction(data: unknown): WalletTransaction | null {
    if (!data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row && typeof row === 'object'
      ? this.normalizeTransaction(row as Record<string, unknown>)
      : null;
  }

  private normalizeWallet(row: Record<string, unknown>): Wallet {
    return {
      id: String(row['id']),
      owner_id: String(row['owner_id']),
      name: String(row['name']),
      theme: isWalletTheme(row['theme']) ? row['theme'] : 'dark',
      initial_balance: Number(row['initial_balance'] ?? 0),
      balance: Number(row['balance'] ?? 0),
      minimum_balance: Number(row['minimum_balance'] ?? 0),
      created_at: String(row['created_at']),
    };
  }

  private normalizeTransaction(row: Record<string, unknown>): WalletTransaction {
    return {
      id: String(row['id']),
      owner_id: String(row['owner_id']),
      wallet_id: String(row['wallet_id']),
      kind: row['kind'] === 'spend' ? 'spend' : 'recharge',
      amount: Number(row['amount']),
      occurred_on: String(row['occurred_on']),
      category_id: typeof row['category_id'] === 'string' ? row['category_id'] : null,
      funding_mode:
        row['funding_mode'] === 'bank' || row['funding_mode'] === 'cash'
          ? row['funding_mode']
          : null,
      bank_account_id: typeof row['bank_account_id'] === 'string' ? row['bank_account_id'] : null,
      notes: typeof row['notes'] === 'string' ? row['notes'] : null,
      debit_transaction_id: String(row['debit_transaction_id']),
      credit_transaction_id:
        typeof row['credit_transaction_id'] === 'string' ? row['credit_transaction_id'] : null,
      created_at: String(row['created_at']),
    };
  }
}

function isWalletTheme(value: unknown): value is CardTheme {
  return value === 'blue'
    || value === 'purple'
    || value === 'dark'
    || value === 'emerald'
    || value === 'sunset'
    || value === 'gold'
    || value === 'rose';
}

function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    .padEnd(32, '0')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-4${hex.slice(9, 12)}-8${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
