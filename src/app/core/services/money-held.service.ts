import { Injectable, computed, effect, inject, signal } from '@angular/core';

import {
  MoneyHeldDirection,
  MoneyHeldPerson,
  MoneyHeldTransaction,
  PaymentMode,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { PeopleService } from './people.service';
import { BankAccountsService } from './bank-accounts.service';
import { roundCurrency } from '../../shared/utils/currency-utils';

export interface RecordMoneyHeldInput {
  held_person_id: string;
  direction: MoneyHeldDirection;
  amount: number;
  occurred_on?: string;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
  notes?: string | null;
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

@Injectable({ providedIn: 'root' })
export class MoneyHeldService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly peopleService = inject(PeopleService);
  private readonly bankAccountsService = inject(BankAccountsService);

  private readonly _heldPeople = signal<MoneyHeldPerson[]>([]);
  private readonly _transactions = signal<MoneyHeldTransaction[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isAvailable = signal(true);

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

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const peopleResult = await this.supabase.client
          .from('money_held_people')
          .select('*')
          .order('created_at', { ascending: true });

        if (peopleResult.error) {
          if (this.handleMissingSchema(peopleResult.error)) return;
          console.error('Failed to load money-held people', peopleResult.error);
          return;
        }

        const transactionResult = await this.supabase.client
          .from('money_held_transactions')
          .select('*')
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });

        if (transactionResult.error) {
          if (this.handleMissingSchema(transactionResult.error)) return;
          console.error('Failed to load money-held transactions', transactionResult.error);
          return;
        }

        this._heldPeople.set((peopleResult.data ?? []) as MoneyHeldPerson[]);
        this._transactions.set((transactionResult.data ?? []) as MoneyHeldTransaction[]);
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
    const { data, error } = await this.supabase.client
      .from('money_held_people')
      .insert({ owner_id: ownerId, person_id: personId })
      .select()
      .single();
    if (error) {
      console.error('Failed to add money-held person', error);
      throw error;
    }

    const created = data as MoneyHeldPerson;
    this._heldPeople.update((list) => [...list, created]);
    return created;
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
    const paymentMode = input.payment_mode ?? 'cash';
    const { data, error } = await this.supabase.client
      .from('money_held_transactions')
      .insert({
        owner_id: ownerId,
        held_person_id: input.held_person_id,
        direction: input.direction,
        amount: input.amount,
        occurred_on: input.occurred_on ?? todayIso(),
        payment_mode: paymentMode,
        bank_account_id: input.bank_account_id ?? null,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to record money held', error);
      throw error;
    }

    const created = data as MoneyHeldTransaction;
    this._transactions.update((list) => [created, ...list]);
    await this.adjustBankBalance(created, 1);
    return created;
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
    await this.adjustBankBalance(record, -1);

    const { error } = await this.supabase.client
      .from('money_held_transactions')
      .delete()
      .eq('id', record.id);
    if (error) {
      this._transactions.update((list) => [record, ...list]);
      await this.adjustBankBalance(record, 1);
      console.error('Failed to delete money-held transaction', error);
      throw error;
    }
  }

  private async adjustBankBalance(record: MoneyHeldTransaction, sign: 1 | -1): Promise<void> {
    if (record.payment_mode !== 'bank' || !record.bank_account_id) return;
    const account = this.bankAccountsService.bankAccounts().find(
      (item) => item.id === record.bank_account_id,
    );
    if (!account || account.balance === undefined) return;

    const directionSign = record.direction === 'received' ? 1 : -1;
    try {
      await this.bankAccountsService.update(account.id, {
        balance: roundCurrency(account.balance + directionSign * sign * Number(record.amount)),
      });
    } catch (error) {
      console.error('Failed to update bank account balance for money held', error);
    }
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }

  private ensureAvailable(): void {
    if (!this._isAvailable()) {
      throw new Error('Money Held setup is unavailable. Apply database migration 0008 first.');
    }
  }

  private handleMissingSchema(error: { code?: string; message?: string }): boolean {
    const message = error.message?.toLowerCase() ?? '';
    if (error.code !== 'PGRST205' && error.code !== '42P01' && !message.includes('could not find the table')) {
      return false;
    }
    this._isAvailable.set(false);
    return true;
  }
}

function sumByDirection(
  records: MoneyHeldTransaction[],
  direction: MoneyHeldDirection,
): number {
  return roundCurrency(
    records
      .filter((record) => record.direction === direction)
      .reduce((sum, record) => sum + Number(record.amount), 0),
  );
}

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
