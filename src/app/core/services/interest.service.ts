import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { InterestDisposal, InterestEntry, InterestStage } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import {
  isGreaterCurrency,
  isEqualCurrency,
  roundCurrency,
} from '../../shared/utils/currency-utils';

export interface CreateInterestEntryInput {
  bank_account_id: string;
  amount: number;
  occurred_on?: string;
  notes?: string | null;
}

export interface RecordInterestDisposalInput {
  entry_id: string;
  amount: number;
  occurred_on?: string;
  notes?: string | null;
}

export interface InterestPeriodSummary {
  key: string;
  label: string;
  received: number;
  disposed: number;
  pending: number;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Interest (Riba) tracker service.
 *
 * Writes only to `interest_entries` / `interest_disposals` — never to
 * `transactions`, categories, or bank-account balances — so recorded interest
 * can never leak into personal income, expenses, savings, budgets, the
 * dashboard balance, or reports. Only manually recorded (actually credited)
 * amounts are counted; the model has no notion of estimated interest.
 */
@Injectable({ providedIn: 'root' })
export class InterestService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _entries = signal<InterestEntry[]>([]);
  private readonly _disposals = signal<InterestDisposal[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  readonly entries = this._entries.asReadonly();
  readonly disposals = this._disposals.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();

  /** Total interest actually received (recorded entries only). */
  readonly totalReceived = computed(() =>
    roundCurrency(sumAmounts(this._entries().map((entry) => Number(entry.amount)))),
  );

  /** Amount separated — entries acted upon (separated or already disposed). */
  readonly totalSeparated = computed(() =>
    roundCurrency(
      sumAmounts(
        this._entries()
          .filter((entry) => entry.stage !== 'received')
          .map((entry) => Number(entry.amount)),
      ),
    ),
  );

  /** Total disposed — sum of all disposal records. */
  readonly totalDisposed = computed(() =>
    roundCurrency(sumAmounts(this._disposals().map((disposal) => Number(disposal.amount)))),
  );

  /** Received yet to be given away: received − disposed (never negative). */
  readonly pendingBalance = computed(() =>
    roundCurrency(Math.max(0, this.totalReceived() - this.totalDisposed())),
  );

  readonly monthlySummaries = computed<InterestPeriodSummary[]>(() =>
    this.buildSummaries('month'),
  );

  readonly yearlySummaries = computed<InterestPeriodSummary[]>(() =>
    this.buildSummaries('year'),
  );

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._entries.set([]);
        this._disposals.set([]);
        this._isAvailable.set(true);
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
    if (!this._isAvailable()) return;
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const entryResult = await this.supabase.client
          .from('interest_entries')
          .select('*')
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });

        if (entryResult.error) {
          if (this.handleMissingSchema(entryResult.error)) return;
          console.error('Failed to load interest entries', entryResult.error);
          return;
        }

        const disposalResult = await this.supabase.client
          .from('interest_disposals')
          .select('*')
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });

        if (disposalResult.error) {
          if (this.handleMissingSchema(disposalResult.error)) return;
          console.error('Failed to load interest disposals', disposalResult.error);
          return;
        }

        this._entries.set((entryResult.data ?? []) as InterestEntry[]);
        this._disposals.set((disposalResult.data ?? []) as InterestDisposal[]);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  // ---------------------------------------------------------------- entries

  async createEntry(input: CreateInterestEntryInput): Promise<InterestEntry> {
    this.ensureAvailable();
    const amount = roundCurrency(input.amount ?? 0);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
    const bankAccountId = input.bank_account_id?.trim();
    if (!bankAccountId) throw new Error('Bank account is required.');

    const occurredOn = input.occurred_on ?? todayIso();
    const notes = input.notes?.trim() || null;

    // Duplicate guard (the unique index is the database-level backstop).
    this.assertNoDuplicate(bankAccountId, occurredOn, amount);

    const ownerId = this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('interest_entries')
      .insert({
        owner_id: ownerId,
        bank_account_id: bankAccountId,
        occurred_on: occurredOn,
        amount,
        notes,
      })
      .select()
      .single();
    if (error) {
      if (isDuplicateViolation(error)) {
        throw new Error(
          'A matching interest entry already exists for this date, account, and amount.',
        );
      }
      console.error('Failed to record interest entry', error);
      throw error;
    }

    const created = data as InterestEntry;
    this._entries.update((list) => [created, ...list]);
    return created;
  }

  async deleteEntry(id: string): Promise<void> {
    this.ensureAvailable();
    const current = this._entries().find((entry) => entry.id === id);
    if (!current) return;

    const linked = this.disposalsForEntry(id);
    this._entries.update((list) => list.filter((item) => item.id !== id));
    this._disposals.update((list) => list.filter((item) => item.entry_id !== id));

    // interest_disposals.entry_id is ON DELETE CASCADE (migration 0016), so the
    // linked disposal rows go with the entry in a single atomic delete.
    const { error } = await this.supabase.client
      .from('interest_entries')
      .delete()
      .eq('id', id)
      .eq('owner_id', this.requireUserId());
    if (error) {
      this._entries.update((list) => [current, ...list]);
      if (linked.length > 0) {
        this._disposals.update((list) => [...linked, ...list]);
      }
      console.error('Failed to delete interest entry', error);
      throw error;
    }
  }

  /** Advance an entry from “received” to “separated” (money set aside). */
  async markSeparated(id: string): Promise<void> {
    this.ensureAvailable();
    const current = this._entries().find((entry) => entry.id === id);
    if (!current || current.stage !== 'received') return;

    const patch: Pick<InterestEntry, 'stage' | 'separated_on' | 'updated_at'> = {
      stage: 'separated',
      separated_on: todayIso(),
      updated_at: new Date().toISOString(),
    };
    this._entries.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

    const { error } = await this.supabase.client
      .from('interest_entries')
      .update({ stage: patch.stage, separated_on: patch.separated_on, updated_at: patch.updated_at })
      .eq('id', id)
      .eq('owner_id', this.requireUserId());
    if (error) {
      this._entries.update((list) =>
        list.map((item) => (item.id === id ? { ...item, ...current } : item)),
      );
      console.error('Failed to separate interest entry', error);
      throw error;
    }
  }

  // -------------------------------------------------------------- disposals

  async recordDisposal(input: RecordInterestDisposalInput): Promise<InterestDisposal> {
    this.ensureAvailable();
    const entry = this._entries().find((item) => item.id === input.entry_id);
    if (!entry) throw new Error('Interest entry not found.');

    const amount = roundCurrency(input.amount ?? 0);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
    this.assertWithinRemaining(entry.id, amount);

    const ownerId = this.requireUserId();
    const { data, error } = await this.supabase.client
      .from('interest_disposals')
      .insert({
        owner_id: ownerId,
        entry_id: entry.id,
        occurred_on: input.occurred_on ?? todayIso(),
        amount,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to record interest disposal', error);
      throw error;
    }

    const created = data as InterestDisposal;
    this._disposals.update((list) => [created, ...list]);
    await this.syncEntryStage(entry.id, created.occurred_on);
    return created;
  }

  // ----------------------------------------------------------------- helpers

  disposalsForEntry(entryId: string): InterestDisposal[] {
    return this._disposals().filter((disposal) => disposal.entry_id === entryId);
  }

  disposedForEntry(entryId: string): number {
    return roundCurrency(
      sumAmounts(this.disposalsForEntry(entryId).map((disposal) => Number(disposal.amount))),
    );
  }

  /** Interest of an entry not yet disposed. */
  remainingForEntry(entry: InterestEntry): number {
    return roundCurrency(Math.max(0, Number(entry.amount) - this.disposedForEntry(entry.id)));
  }

  private assertWithinRemaining(entryId: string, amount: number): void {
    const entry = this._entries().find((item) => item.id === entryId);
    if (!entry) throw new Error('Interest entry not found.');
    const remaining = roundCurrency(
      Number(entry.amount) - this.disposedForEntry(entryId),
    );
    if (isGreaterCurrency(amount, remaining)) {
      throw new Error(
        `Disposal cannot exceed the remaining interest of ₹${remaining.toFixed(2)} for this entry.`,
      );
    }
  }

  private assertNoDuplicate(
    bankAccountId: string,
    occurredOn: string,
    amount: number,
  ): void {
    const duplicate = this._entries().some(
      (entry) =>
        entry.occurred_on === occurredOn &&
        entry.bank_account_id === bankAccountId &&
        isEqualCurrency(Number(entry.amount), amount),
    );
    if (duplicate) {
      throw new Error(
        'A matching interest entry already exists for this date, account, and amount.',
      );
    }
  }

  /**
   * Recompute an entry's stage from its disposal records:
   * fully covered → disposed, partially covered (or manually separated) →
   * separated, nothing covered → received.
   */
  private async syncEntryStage(entryId: string, hintDate?: string): Promise<void> {
    const entry = this._entries().find((item) => item.id === entryId);
    if (!entry) return;

    const disposed = this.disposedForEntry(entryId);
    const amount = Number(entry.amount);
    let stage: InterestStage;
    if (disposed >= amount - 0.000001) {
      stage = 'disposed';
    } else if (disposed > 0 || entry.separated_on) {
      stage = 'separated';
    } else {
      stage = 'received';
    }

    // A disposal implies the money was separated at some point.
    const separatedOn =
      entry.separated_on ?? (stage !== 'received' ? hintDate ?? todayIso() : null);

    if (stage === entry.stage && separatedOn === entry.separated_on) return;

    const previous = entry;
    const patch = { stage, separated_on: separatedOn, updated_at: new Date().toISOString() };
    this._entries.update((list) =>
      list.map((item) => (item.id === entryId ? { ...item, ...patch } : item)),
    );

    const { error } = await this.supabase.client
      .from('interest_entries')
      .update({ stage, separated_on: separatedOn, updated_at: patch.updated_at })
      .eq('id', entryId)
      .eq('owner_id', this.requireUserId());
    if (error) {
      this._entries.update((list) =>
        list.map((item) => (item.id === entryId ? previous : item)),
      );
      console.error('Failed to sync interest entry stage', error);
    }
  }

  private buildSummaries(granularity: 'month' | 'year'): InterestPeriodSummary[] {
    const buckets = new Map<string, InterestPeriodSummary>();

    const keyFor = (occurredOn: string): string =>
      granularity === 'month' ? occurredOn.slice(0, 7) : occurredOn.slice(0, 4);

    const labelFor = (key: string): string => {
      if (granularity === 'year') return key;
      const [year, month] = key.split('-').map(Number);
      return `${MONTH_LABELS[month - 1]} ${year}`;
    };

    const bucketFor = (occurredOn: string): InterestPeriodSummary => {
      const key = keyFor(occurredOn);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, label: labelFor(key), received: 0, disposed: 0, pending: 0 };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const entry of this._entries()) {
      const bucket = bucketFor(entry.occurred_on);
      bucket.received = roundCurrency(bucket.received + Number(entry.amount));
    }
    for (const disposal of this._disposals()) {
      const bucket = bucketFor(disposal.occurred_on);
      bucket.disposed = roundCurrency(bucket.disposed + Number(disposal.amount));
    }

    const summaries = [...buckets.values()].map((bucket) => ({
      ...bucket,
      received: roundCurrency(bucket.received),
      disposed: roundCurrency(bucket.disposed),
      pending: roundCurrency(Math.max(0, bucket.received - bucket.disposed)),
    }));
    summaries.sort((a, b) => b.key.localeCompare(a.key));
    return granularity === 'month' ? summaries.slice(0, 12) : summaries;
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }

  private ensureAvailable(): void {
    if (!this._isAvailable()) {
      throw new Error(
        'Interest tracker setup is unavailable. Apply db/migrations/0015_interest_tracker.sql first.',
      );
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
}

function sumAmounts(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isDuplicateViolation(error: { code?: string }): boolean {
  return error.code === '23505';
}

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
