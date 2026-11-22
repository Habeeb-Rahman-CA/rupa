import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  MoneyHeldDirection,
  MoneyHeldPerson,
  MoneyHeldTransaction,
  PaymentMode,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { PeopleService } from './people.service';
import { BankAccountsService } from './bank-accounts.service';
import { roundCurrency } from '../../shared/utils/currency-utils';
import { todayIso } from '../../shared/utils/budget-utils';

export interface RecordMoneyHeldInput {
  /**
   * Client-generated id for the ledger row. A caller that may retry (the
   * record sheet) must reuse the same id for every attempt, so a request that
   * reached the database but lost its response is recorded exactly once.
   */
  id?: string;
  held_person_id: string;
  direction: MoneyHeldDirection;
  amount: number;
  occurred_on?: string;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
  notes?: string | null;
}

interface MoneyHeldPersonResponse {
  id: string;
  owner_id: string;
  person_id: string;
  created_at: string;
}

interface MoneyHeldTransactionResponse {
  id: string;
  owner_id: string;
  held_person_id: string;
  direction: MoneyHeldDirection;
  amount: number;
  occurred_on: string;
  payment_mode: PaymentMode;
  bank_account_id: string | null;
  notes: string | null;
  created_at: string;
}

interface MoneyHeldBalanceResponse {
  id: string;
  personId: string;
  name: string;
  received: number;
  returned: number;
  outstanding: number;
}

export interface MoneyHeldBalance {
  id: string;
  personId: string;
  name: string;
  received: number;
  returned: number;
  outstanding: number;
  records: MoneyHeldTransaction[];
}

interface RecordRequest {
  id?: string;
  held_person_id: string;
  direction: MoneyHeldDirection;
  amount: number;
  occurred_on: string;
  payment_mode: PaymentMode;
  bank_account_id: string | null;
  notes: string | null;
}

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class MoneyHeldService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly peopleService = inject(PeopleService);
  private readonly bankAccountsService = inject(BankAccountsService);

  private readonly _heldPeople = signal<MoneyHeldPerson[]>([]);
  private readonly _transactions = signal<MoneyHeldTransaction[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

  /**
   * Bumped before every local mutation of the money-held ledger.
   *
   * `load()` records it before issuing its SELECTs and throws the response
   * away if it moved on while the request was in flight. Without that guard a
   * slow refresh resolves after a write and reverts it with a pre-write
   * snapshot — the saved row disappears and the balance jumps back.
   */
  private writeVersion = 0;

  readonly heldPeople = this._heldPeople.asReadonly();
  readonly transactions = this._transactions.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isAvailable = this._isAvailable.asReadonly();

  readonly balances = computed<MoneyHeldBalance[]>(() => {
    const people = this.peopleService.people();
    const records = this._transactions();
    return this._heldPeople().map((heldPerson) => {
      const person = people.find((p) => p.id === heldPerson.person_id);
      const personRecords = records.filter((record) => record.held_person_id === heldPerson.id);
      const received = sumByDirection(personRecords, 'received');
      const returned = sumByDirection(personRecords, 'returned');
      return {
        id: heldPerson.id,
        personId: heldPerson.person_id,
        name: person?.name ?? 'Unknown person',
        received,
        returned,
        outstanding: roundCurrency(received - returned),
        records: personRecords,
      };
    });
  });

  readonly totalHeld = computed(() =>
    roundCurrency(this.balances().reduce((sum, balance) => sum + balance.outstanding, 0)),
  );

  readonly peopleCount = computed(() => this.balances().length);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._heldPeople.set([]);
        this._transactions.set([]);
        this._isAvailable.set(true);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._heldPeople.set([]);
      this._transactions.set([]);
      return;
    }
    if (!this._isAvailable()) return;
    if (this.loadPromise) return this.loadPromise;

    const versionAtStart = this.writeVersion;
    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [peopleRows, transactionRows] = await Promise.all([
          firstValueFrom(this.api.get<MoneyHeldPersonResponse[]>('/money-held/people')),
          firstValueFrom(this.api.get<MoneyHeldTransactionResponse[]>('/money-held/transactions')),
        ]);

        // A record was written while these SELECTs were in flight, so this
        // snapshot predates it. Applying it would make the saved record
        // disappear; drop it and let the next sync reconcile instead.
        if (versionAtStart !== this.writeVersion) return;

        this._heldPeople.set(peopleRows as MoneyHeldPerson[]);
        this._transactions.set(transactionRows as MoneyHeldTransaction[]);
      } catch (err) {
        console.error('Failed to load money-held data', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async addPerson(personId: string): Promise<MoneyHeldPerson> {
    this.ensureAvailable();
    const existing = this._heldPeople().find((person) => person.person_id === personId);
    if (existing) return existing;

    const ownerId = this.requireUserId();
    try {
      const created = await firstValueFrom(
        this.api.post<MoneyHeldPersonResponse>('/money-held/people', {
          person_id: personId,
        }),
      );
      const result = created as MoneyHeldPerson;
      this._heldPeople.update((list) => [...list, result]);
      this.writeVersion += 1;
      return result;
    } catch (error) {
      console.error('Failed to add money-held person', error);
      throw error;
    }
  }

  balanceFor(heldPersonId: string): number {
    return this.balances().find((balance) => balance.id === heldPersonId)?.outstanding ?? 0;
  }

  async record(input: RecordMoneyHeldInput): Promise<MoneyHeldTransaction> {
    this.ensureAvailable();
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    if (!this._heldPeople().some((person) => person.id === input.held_person_id)) {
      throw new Error('Held-money person not found.');
    }

    const outstanding = this.balanceFor(input.held_person_id);
    if (input.direction === 'returned' && input.amount > outstanding + 0.000001) {
      throw new Error('Return amount cannot exceed the outstanding balance.');
    }

    const ownerId = this.requireUserId();
    const payload: RecordRequest = {
      id: input.id ?? newRecordId(),
      held_person_id: input.held_person_id,
      direction: input.direction,
      amount: input.amount,
      occurred_on: input.occurred_on ?? todayIso(),
      payment_mode: input.payment_mode ?? 'cash',
      bank_account_id: input.bank_account_id ?? null,
      notes: input.notes?.trim() || null,
    };

    return this.insertAndAdjust(payload);
  }

  /**
   * Persist a ledger row and move the linked card balance.
   *
   * The row is written first, so a retry that finds it already present knows
   * the previous attempt never reached the balance step. Replaying a
   * half-finished attempt therefore neither duplicates the record nor applies
   * the balance twice.
   */
  private async insertAndAdjust(payload: RecordRequest): Promise<MoneyHeldTransaction> {
    let created: MoneyHeldTransaction;

    try {
      const response = await firstValueFrom(
        this.api.post<MoneyHeldTransactionResponse>('/money-held/transactions', payload),
      );
      created = response as MoneyHeldTransaction;
    } catch (error: any) {
      // Check if this is a duplicate key error (row already exists)
      if (error?.status === 409 || error?.message?.toLowerCase().includes('duplicate')) {
        const existing = await this.fetchTransaction(String(payload.id));
        if (!existing) {
          console.error('Failed to record money held', error);
          throw error;
        }
        created = existing;
      } else {
        console.error('Failed to record money held', error);
        throw error;
      }
    }

    this._transactions.update((list) => {
      const index = list.findIndex((item) => item.id === created.id);
      if (index === -1) return [created, ...list];
      const next = [...list];
      next[index] = created;
      return next;
    });
    this.writeVersion += 1;

    await this.adjustBankBalance(created, 1);
    return created;
  }

  private async fetchTransaction(id: string): Promise<MoneyHeldTransaction | null> {
    try {
      const rows = await firstValueFrom(
        this.api.get<MoneyHeldTransactionResponse[]>(`/money-held/transactions`),
      );
      const match = rows.find((r) => r.id === id);
      return match ?? null;
    } catch {
      return null;
    }
  }

  async delete(record: MoneyHeldTransaction): Promise<void> {
    const current = this._transactions().find((item) => item.id === record.id);
    if (!current) return;

    if (current.direction === 'received') {
      const balance = this.balances().find((item) => item.id === current.held_person_id);
      const remainingReceived = (balance?.received ?? 0) - Number(current.amount);
      if (remainingReceived + 0.000001 < (balance?.returned ?? 0)) {
        throw new Error('Delete returned records first before deleting this receipt.');
      }
    }

    this._transactions.update((list) => list.filter((item) => item.id !== record.id));
    this.writeVersion += 1;

    try {
      await this.adjustBankBalance(record, -1);
    } catch (err) {
      // Nothing has reached the database yet, so put the record back and keep
      // the list matching what is actually stored.
      this._transactions.update((list) => [record, ...list]);
      this.writeVersion += 1;
      throw err;
    }

    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/money-held/transactions/${record.id}`));
    } catch (error) {
      this._transactions.update((list) => [record, ...list]);
      this.writeVersion += 1;
      try {
        await this.adjustBankBalance(record, 1);
      } catch (balanceError) {
        console.error('Failed to restore bank account balance for money held', balanceError);
      }
      console.error('Failed to delete money-held transaction', error);
      throw error;
    }
  }

  private async adjustBankBalance(record: MoneyHeldTransaction, sign: 1 | -1): Promise<void> {
    if (record.payment_mode !== 'bank' || !record.bank_account_id) return;
    const account = this.bankAccountsService
      .bankAccounts()
      .find((item) => item.id === record.bank_account_id);
    if (!account || account.balance === undefined) return;

    const directionSign = record.direction === 'received' ? 1 : -1;
    try {
      await this.bankAccountsService.update(account.id, {
        balance: roundCurrency(account.balance + directionSign * sign * Number(record.amount)),
      });
    } catch (error) {
      console.error('Failed to update bank account balance for money held', error);
      throw new Error("Couldn't update the card balance — please try again.");
    }
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }

  private ensureAvailable(): void {
    if (!this._isAvailable()) {
      throw new Error('Money Held setup is unavailable.');
    }
  }
}

function sumByDirection(records: MoneyHeldTransaction[], direction: MoneyHeldDirection): number {
  return roundCurrency(
    records
      .filter((record) => record.direction === direction)
      .reduce((sum, record) => sum + Number(record.amount), 0),
  );
}

/**
 * A random UUID v4 for a ledger row id. The id is generated on the client so
 * that a retried request can be recognised as the same record instead of
 * being inserted twice.
 */
export function newRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure id generation is unavailable in this browser.');
}
