import { Injectable, effect, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Debt, DebtDirection, DebtPayment } from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface DebtResponse {
  id: string;
  owner_id: string;
  person_id: string;
  direction: DebtDirection;
  principal: number;
  outstanding: number;
  reason: string | null;
  opened_on: string;
  closed_on: string | null;
  created_at: string;
}

interface CreateDebtRequest {
  person_id: string;
  direction: DebtDirection;
  principal: number;
  reason: string | null;
  opened_on: string;
}

interface AddPaymentRequest {
  amount: number;
  paid_on: string;
  notes: string | null;
}

export type DebtTransactionImpact = 'default' | 'reduce' | 'increase';

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class DebtsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _debts = signal<Debt[]>([]);
  private readonly _isLoading = signal(false);

  readonly debts = this._debts.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly theyOweYouTotal = computed(() =>
    this._debts()
      .filter((d) => d.direction === 'they_owe')
      .reduce((sum, d) => sum + Number(d.outstanding), 0),
  );
  readonly youOweTotal = computed(() =>
    this._debts()
      .filter((d) => d.direction === 'i_owe')
      .reduce((sum, d) => sum + Number(d.outstanding), 0),
  );
  readonly openDebts = computed(() => this._debts());

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
        const rows = await firstValueFrom(
          this.api.get<DebtResponse[]>('/debts'),
        );
        this._debts.set(rows as Debt[]);
      } catch (err) {
        console.error('Failed to load debts', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async createDebt(input: {
    person_id: string;
    direction: DebtDirection;
    principal: number;
    reason: string | null;
    opened_on: string;
  }): Promise<Debt> {
    return this.create(input);
  }

  async create(input: {
    person_id: string;
    direction: DebtDirection;
    principal: number;
    reason: string | null;
    opened_on: string;
  }): Promise<Debt> {
    try {
      const created = await firstValueFrom(
        this.api.post<DebtResponse>('/debts', {
          person_id: input.person_id,
          direction: input.direction,
          principal: input.principal,
          reason: input.reason?.trim() || null,
          opened_on: input.opened_on,
        } as CreateDebtRequest),
      );
      const debt = created as Debt;
      this._debts.update((list) => [...list, debt]);
      return debt;
    } catch (error) {
      console.error('Failed to create debt', error);
      throw error;
    }
  }

  async addPayment(debtId: string, input: {
    amount: number;
    paid_on: string;
    notes: string | null;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.api.post(`/debts/${debtId}/payments`, {
          amount: input.amount,
          paid_on: input.paid_on,
          notes: input.notes?.trim() || null,
        } as AddPaymentRequest),
      );
    } catch (error) {
      console.error('Failed to add debt payment', error);
      throw error;
    }
  }

  async deleteDebt(id: string): Promise<void> {
    return this.delete(id);
  }

  async delete(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/debts/${id}`));
      this._debts.update((list) => list.filter((d) => d.id !== id));
    } catch (error) {
      console.error('Failed to delete debt', error);
      throw error;
    }
  }
}
