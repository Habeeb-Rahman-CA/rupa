import { Injectable, effect, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  InterestEntry,
  InterestDisposal,
  InterestStage,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface InterestEntryResponse {
  id: string;
  owner_id: string;
  bank_account_id: string;
  occurred_on: string;
  amount: number;
  stage: InterestStage;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InterestDisposalResponse {
  id: string;
  owner_id: string;
  entry_id: string;
  occurred_on: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InterestSummaryResponse {
  received: number;
  disposed: number;
  pending: number;
}

/** Input shape used by the interest dialog. */
export interface CreateInterestEntryInput {
  bank_account_id: string;
  occurred_on: string;
  amount: number;
  stage: InterestStage;
  notes: string | null;
}

interface CreateInterestEntryRequest {
  bank_account_id: string;
  occurred_on: string;
  amount: number;
  stage: InterestStage;
  notes: string | null;
}

interface UpdateInterestEntryStageRequest {
  stage: InterestStage;
}

/** Input shape used by the interest disposal dialog. */
export interface RecordInterestDisposalInput {
  occurred_on: string;
  amount: number;
  notes: string | null;
}

interface CreateInterestDisposalRequest {
  occurred_on: string;
  amount: number;
  notes: string | null;
}

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class InterestService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _entries = signal<InterestEntry[]>([]);
  private readonly _disposals = signal<InterestDisposal[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  readonly entries = this._entries.asReadonly();
  readonly disposals = this._disposals.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();

  readonly totalReceived = computed(() =>
    this._entries()
      .filter((e) => e.stage === 'received')
      .reduce((sum, e) => sum + Number(e.amount), 0),
  );
  readonly totalDisposed = computed(() =>
    this._entries()
      .filter((e) => e.stage === 'disposed')
      .reduce((sum, e) => sum + Number(e.amount), 0),
  );
  readonly pendingBalance = computed(() =>
    Math.max(0, this.totalReceived() - this.totalDisposed()),
  );

  disposedForEntry(entryId: string): number {
    return this._disposals()
      .filter((d) => d.entry_id === entryId)
      .reduce((sum, d) => sum + Number(d.amount), 0);
  }

  remainingForEntry(entry: InterestEntry): number {
    const disposed = this.disposedForEntry(entry.id);
    return Math.max(0, Number(entry.amount) - disposed);
  }

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._entries.set([]);
        this._disposals.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._entries.set([]);
      this._disposals.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [entries, disposals] = await Promise.all([
          firstValueFrom(this.api.get<InterestEntryResponse[]>('/interest/entries')),
          firstValueFrom(this.api.get<InterestDisposalResponse[]>('/interest/disposals')),
        ]);
        this._entries.set(entries as InterestEntry[]);
        this._disposals.set(disposals as InterestDisposal[]);
      } catch (err) {
        console.error('Failed to load interest data', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async createEntry(input: {
    bank_account_id: string;
    occurred_on: string;
    amount: number;
    stage: InterestStage;
    notes: string | null;
  }): Promise<InterestEntry> {
    try {
      const created = await firstValueFrom(
        this.api.post<InterestEntryResponse>('/interest/entries', {
          bank_account_id: input.bank_account_id,
          occurred_on: input.occurred_on,
          amount: input.amount,
          stage: input.stage,
          notes: input.notes?.trim() || null,
        } as CreateInterestEntryRequest),
      );
      return created as InterestEntry;
    } catch (error) {
      console.error('Failed to create interest entry', error);
      throw error;
    }
  }

  async updateEntryStage(id: string, stage: InterestStage): Promise<InterestEntry> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<InterestEntryResponse>(`/interest/entries/${id}`, {
          stage,
        } as UpdateInterestEntryStageRequest),
      );
      return updated as InterestEntry;
    } catch (error) {
      console.error('Failed to update interest entry stage', error);
      throw error;
    }
  }

  async deleteEntry(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/interest/entries/${id}`));
    } catch (error) {
      console.error('Failed to delete interest entry', error);
      throw error;
    }
  }

  async recordDisposal(input: {
    occurred_on: string;
    amount: number;
    notes: string | null;
  }): Promise<InterestDisposal[]> {
    try {
      const created = await firstValueFrom(
        this.api.post<InterestDisposalResponse[]>('/interest/disposals', {
          occurred_on: input.occurred_on,
          amount: input.amount,
          notes: input.notes?.trim() || null,
        } as CreateInterestDisposalRequest),
      );
      return created as InterestDisposal[];
    } catch (error) {
      console.error('Failed to record interest disposal', error);
      throw error;
    }
  }

  async deleteDisposal(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/interest/disposals/${id}`));
    } catch (error) {
      console.error('Failed to delete interest disposal', error);
      throw error;
    }
  }

  async summary(): Promise<InterestSummaryResponse> {
    try {
      return await firstValueFrom(
        this.api.get<InterestSummaryResponse>('/interest/summary'),
      );
    } catch (error) {
      console.error('Failed to load interest summary', error);
      return { received: 0, disposed: 0, pending: 0 };
    }
  }
}
