import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Wallet, WalletTransaction, WalletTransactionKind, PaymentMode } from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { todayIso } from '../../shared/utils/budget-utils';
import { roundCurrency } from '../../shared/utils/currency-utils';

interface WalletResponse {
  id: string;
  owner_id: string;
  name: string;
  theme: string;
  initial_balance: number;
  balance: number;
  minimum_balance: number;
  created_at: string;
}

interface CreateWalletRequest {
  name: string;
  theme: string;
  initial_balance?: number;
  balance?: number;
  minimum_balance?: number;
}

interface UpdateWalletRequest {
  name?: string;
  theme?: string;
  balance?: number;
  initial_balance?: number;
  minimum_balance?: number;
}

interface WalletTransactionResponse {
  id: string;
  owner_id: string;
  wallet_id: string;
  kind: WalletTransactionKind;
  amount: number;
  occurred_on: string;
  category_id: string | null;
  funding_mode: PaymentMode | null;
  bank_account_id: string | null;
  notes: string | null;
  debit_transaction_id: string;
  credit_transaction_id: string | null;
  created_at: string;
}

interface CreateWalletTransactionRequest {
  kind: WalletTransactionKind;
  amount: number;
  occurred_on: string;
  category_id: string | null;
  funding_mode: PaymentMode | null;
  bank_account_id: string | null;
  notes: string | null;
}

interface DeleteResponse {
  message: string;
}

/** Input shape used by the wallet transaction sheet. */
export interface WalletTransactionInput {
  kind: WalletTransactionKind;
  amount: number;
  occurred_on: string;
  category_id: string | null;
  funding_mode: PaymentMode | null;
  bank_account_id: string | null;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class WalletsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _wallets = signal<Wallet[]>([]);
  private readonly _walletTransactions = new Map<string, WalletTransaction[]>();
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  readonly wallets = this._wallets.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._wallets.set([]);
        this._walletTransactions.clear();
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._wallets.set([]);
      this._walletTransactions.clear();
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [walletRows] = await Promise.all([
          firstValueFrom(this.api.get<WalletResponse[]>('/wallets')),
        ]);
        this._wallets.set(walletRows as Wallet[]);
        // Load transactions for each wallet
        for (const wallet of this._wallets()) {
          try {
            const txs = await firstValueFrom(
              this.api.get<WalletTransactionResponse[]>(`/wallets/${wallet.id}/transactions`),
            );
            this._walletTransactions.set(wallet.id, txs as WalletTransaction[]);
          } catch {
            this._walletTransactions.set(wallet.id, []);
          }
        }
      } catch (err) {
        console.error('Failed to load wallets', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /** Create an alias for component compatibility. */
  async create(input: {
    name: string;
    theme: string;
    initial_balance?: number;
    balance?: number;
    minimum_balance?: number;
  }): Promise<Wallet> {
    return this.createWallet(input);
  }

  async createWallet(input: {
    name: string;
    theme: string;
    initial_balance?: number;
    balance?: number;
    minimum_balance?: number;
  }): Promise<Wallet> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    try {
      const created = await firstValueFrom(
        this.api.post<WalletResponse>('/wallets', {
          name: input.name.trim(),
          theme: input.theme || 'blue',
          initial_balance: input.initial_balance ?? 0,
          balance: input.balance ?? 0,
          minimum_balance: input.minimum_balance ?? 0,
        } as CreateWalletRequest),
      );
      const wallet = created as Wallet;
      this._wallets.update((list) => [...list, wallet]);
      return wallet;
    } catch (error) {
      console.error('Failed to create wallet', error);
      throw error;
    }
  }

  /** Create an alias for component compatibility. */
  async update(id: string, input: {
    name?: string;
    theme?: string;
    balance?: number;
    initial_balance?: number;
    minimum_balance?: number;
  }): Promise<Wallet> {
    return this.updateWallet(id, input);
  }

  async updateWallet(id: string, input: {
    name?: string;
    theme?: string;
    balance?: number;
    initial_balance?: number;
    minimum_balance?: number;
  }): Promise<Wallet> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<WalletResponse>(`/wallets/${id}`, input as UpdateWalletRequest),
      );
      const wallet = updated as Wallet;
      this._wallets.update((list) => list.map((w) => (w.id === id ? wallet : w)));
      return wallet;
    } catch (error) {
      console.error('Failed to update wallet', error);
      throw error;
    }
  }

  /** Create an alias for component compatibility. */
  async delete(id: string): Promise<void> {
    return this.deleteWallet(id);
  }

  async deleteWallet(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/wallets/${id}`));
      this._wallets.update((list) => list.filter((w) => w.id !== id));
      this._walletTransactions.delete(id);
    } catch (error) {
      console.error('Failed to delete wallet', error);
      throw error;
    }
  }

  /** List transactions for a specific wallet. */
  transactionsFor(walletId: string): WalletTransaction[] {
    return this._walletTransactions.get(walletId) ?? [];
  }

  async listWalletTransactions(walletId: string): Promise<WalletTransaction[]> {
    try {
      const rows = await firstValueFrom(
        this.api.get<WalletTransactionResponse[]>(`/wallets/${walletId}/transactions`),
      );
      const txs = rows as WalletTransaction[];
      this._walletTransactions.set(walletId, txs);
      return txs;
    } catch (error) {
      console.error('Failed to load wallet transactions', error);
      return [];
    }
  }

  /** Create an alias for component compatibility. */
  async createTransaction(walletId: string, input: WalletTransactionInput): Promise<WalletTransaction> {
    return this.createWalletTransaction(walletId, input);
  }

  async createWalletTransaction(walletId: string, input: {
    kind: WalletTransactionKind;
    amount: number;
    occurred_on: string;
    category_id: string | null;
    funding_mode: PaymentMode | null;
    bank_account_id: string | null;
    notes: string | null;
  }): Promise<WalletTransaction> {
    try {
      const created = await firstValueFrom(
        this.api.post<WalletTransactionResponse>(
          `/wallets/${walletId}/transactions`,
          {
            kind: input.kind,
            amount: input.amount,
            occurred_on: input.occurred_on,
            category_id: input.category_id,
            funding_mode: input.funding_mode,
            bank_account_id: input.bank_account_id,
            notes: input.notes?.trim() || null,
          } as CreateWalletTransactionRequest,
        ),
      );
      const tx = created as WalletTransaction;
      // Update the transactions map for this wallet
      const existing = this._walletTransactions.get(walletId) ?? [];
      this._walletTransactions.set(walletId, [tx, ...existing]);
      return tx;
    } catch (error) {
      console.error('Failed to create wallet transaction', error);
      throw error;
    }
  }

  /** Create an alias for component compatibility. */
  async updateTransaction(transactionId: string, input: WalletTransactionInput): Promise<WalletTransaction> {
    return this.updateWalletTransaction(transactionId, input);
  }

  async updateWalletTransaction(transactionId: string, input: {
    kind: WalletTransactionKind;
    amount: number;
    occurred_on: string;
    category_id: string | null;
    funding_mode: PaymentMode | null;
    bank_account_id: string | null;
    notes: string | null;
  }): Promise<WalletTransaction> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<WalletTransactionResponse>(
          `/wallets/transactions/${transactionId}`,
          {
            kind: input.kind,
            amount: input.amount,
            occurred_on: input.occurred_on,
            category_id: input.category_id,
            funding_mode: input.funding_mode,
            bank_account_id: input.bank_account_id,
            notes: input.notes?.trim() || null,
          } as CreateWalletTransactionRequest,
        ),
      );
      const tx = updated as WalletTransaction;
      // Update in the transactions map
      for (const [walletId, list] of this._walletTransactions) {
        const idx = list.findIndex((t) => t.id === transactionId);
        if (idx !== -1) {
          const next = [...list];
          next[idx] = tx;
          this._walletTransactions.set(walletId, next);
          break;
        }
      }
      return tx;
    } catch (error) {
      console.error('Failed to update wallet transaction', error);
      throw error;
    }
  }

  /** Create an alias for component compatibility. */
  async deleteTransaction(transaction: WalletTransaction): Promise<void> {
    return this.deleteWalletTransaction(transaction.id);
  }

  async deleteWalletTransaction(transactionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.api.delete<DeleteResponse>(`/wallets/transactions/${transactionId}`),
      );
      for (const [walletId, list] of this._walletTransactions) {
        const idx = list.findIndex((t) => t.id === transactionId);
        if (idx !== -1) {
          const next = [...list];
          next.splice(idx, 1);
          this._walletTransactions.set(walletId, next);
          break;
        }
      }
    } catch (error) {
      console.error('Failed to delete wallet transaction', error);
      throw error;
    }
  }
}
