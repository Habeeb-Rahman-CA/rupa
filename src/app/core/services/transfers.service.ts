import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountTransfer } from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface AccountTransferResponse {
  id: string;
  owner_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  occurred_on: string;
  notes: string | null;
  debit_transaction_id: string;
  credit_transaction_id: string;
  created_at: string;
}

interface CreateTransferRequest {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  occurred_on: string;
  notes: string | null;
}

interface UpdateTransferRequest {
  source_account_id?: string;
  destination_account_id?: string;
  amount?: number;
  occurred_on?: string;
  notes?: string | null;
}

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class TransfersService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _transfers = signal<AccountTransfer[]>([]);
  private readonly _isLoading = signal(false);

  readonly transfers = this._transfers.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._transfers.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._transfers.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const rows = await firstValueFrom(
          this.api.get<AccountTransferResponse[]>('/transfers'),
        );
        this._transfers.set(rows as AccountTransfer[]);
      } catch (err) {
        console.error('Failed to load transfers', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async createTransfer(input: {
    source_account_id: string;
    destination_account_id: string;
    amount: number;
    occurred_on: string;
    notes: string | null;
  }): Promise<AccountTransfer> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    try {
      const created = await firstValueFrom(
        this.api.post<AccountTransferResponse>('/transfers', {
          source_account_id: input.source_account_id,
          destination_account_id: input.destination_account_id,
          amount: input.amount,
          occurred_on: input.occurred_on,
          notes: input.notes?.trim() || null,
        } as CreateTransferRequest),
      );
      return created as AccountTransfer;
    } catch (error) {
      console.error('Failed to create transfer', error);
      throw error;
    }
  }

  async updateTransfer(id: string, input: {
    source_account_id?: string;
    destination_account_id?: string;
    amount?: number;
    occurred_on?: string;
    notes?: string | null;
  }): Promise<AccountTransfer> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<AccountTransferResponse>(`/transfers/${id}`, input as UpdateTransferRequest),
      );
      return updated as AccountTransfer;
    } catch (error) {
      console.error('Failed to update transfer', error);
      throw error;
    }
  }

  async deleteTransfer(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/transfers/${id}`));
    } catch (error) {
      console.error('Failed to delete transfer', error);
      throw error;
    }
  }
}
