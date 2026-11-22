import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Subscription,
  SubscriptionBillingCycle,
  SubscriptionStatus,
  SubscriptionTheme,
  SubscriptionRenewal,
  SubscriptionPayment,
  SubscriptionPriceChange,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface SubscriptionResponse {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  amount: number;
  billing_cycle: SubscriptionBillingCycle;
  start_date: string;
  next_renewal_date: string;
  end_date: string | null;
  payment_account_id: string | null;
  auto_renewal: boolean;
  status: SubscriptionStatus;
  theme: SubscriptionTheme;
  cancelled_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateSubscriptionRequest {
  name: string;
  category: string;
  amount: number;
  billing_cycle: SubscriptionBillingCycle;
  start_date: string;
  next_renewal_date: string;
  end_date: string | null;
  payment_account_id: string | null;
  auto_renewal: boolean;
  status: SubscriptionStatus;
  theme: SubscriptionTheme;
  notes: string | null;
}

interface UpdateSubscriptionRequest {
  name?: string;
  category?: string;
  amount?: number;
  billing_cycle?: SubscriptionBillingCycle;
  start_date?: string;
  next_renewal_date?: string;
  end_date?: string | null;
  payment_account_id?: string | null;
  auto_renewal?: boolean;
  status?: SubscriptionStatus;
  theme?: SubscriptionTheme;
  cancelled_on?: string | null;
  notes?: string | null;
}

interface RecordPaymentRequest {
  amount: number;
  paid_on: string;
  transaction_id: string | null;
  notes: string | null;
}

interface SubscriptionRenewalResponse {
  id: string;
  owner_id: string;
  subscription_id: string;
  due_on: string;
  renewed_on: string;
  amount: number;
  status: string;
  notes: string | null;
  created_at: string;
}

interface SubscriptionPaymentResponse {
  id: string;
  owner_id: string;
  subscription_id: string;
  renewal_id: string;
  amount: number;
  paid_on: string;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
}

interface SubscriptionPriceChangeResponse {
  id: string;
  owner_id: string;
  subscription_id: string;
  old_amount: number;
  new_amount: number;
  effective_on: string;
  notes: string | null;
  created_at: string;
}

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _subscriptions = signal<Subscription[]>([]);
  private readonly _isLoading = signal(false);

  readonly subscriptions = this._subscriptions.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._subscriptions.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._subscriptions.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const rows = await firstValueFrom(
          this.api.get<SubscriptionResponse[]>('/subscriptions'),
        );
        this._subscriptions.set(rows as Subscription[]);
      } catch (err) {
        console.error('Failed to load subscriptions', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async createSubscription(input: {
    name: string;
    category: string;
    amount: number;
    billing_cycle: SubscriptionBillingCycle;
    start_date: string;
    next_renewal_date: string;
    end_date: string | null;
    payment_account_id: string | null;
    auto_renewal: boolean;
    status: SubscriptionStatus;
    theme: SubscriptionTheme;
    notes: string | null;
  }): Promise<Subscription> {
    try {
      const created = await firstValueFrom(
        this.api.post<SubscriptionResponse>('/subscriptions', {
          name: input.name.trim(),
          category: input.category,
          amount: input.amount,
          billing_cycle: input.billing_cycle,
          start_date: input.start_date,
          next_renewal_date: input.next_renewal_date,
          end_date: input.end_date,
          payment_account_id: input.payment_account_id,
          auto_renewal: input.auto_renewal,
          status: input.status,
          theme: input.theme,
          notes: input.notes?.trim() || null,
        } as CreateSubscriptionRequest),
      );
      return created as Subscription;
    } catch (error) {
      console.error('Failed to create subscription', error);
      throw error;
    }
  }

  async getSubscription(id: string): Promise<Subscription> {
    try {
      const row = await firstValueFrom(
        this.api.get<SubscriptionResponse>(`/subscriptions/${id}`),
      );
      return row as Subscription;
    } catch (error) {
      console.error('Failed to get subscription', error);
      throw error;
    }
  }

  async updateSubscription(id: string, input: {
    name?: string;
    category?: string;
    amount?: number;
    billing_cycle?: SubscriptionBillingCycle;
    start_date?: string;
    next_renewal_date?: string;
    end_date?: string | null;
    payment_account_id?: string | null;
    auto_renewal?: boolean;
    status?: SubscriptionStatus;
    theme?: SubscriptionTheme;
    cancelled_on?: string | null;
    notes?: string | null;
  }): Promise<Subscription> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<SubscriptionResponse>(`/subscriptions/${id}`, {
          name: input.name?.trim(),
          category: input.category,
          amount: input.amount,
          billing_cycle: input.billing_cycle,
          start_date: input.start_date,
          next_renewal_date: input.next_renewal_date,
          end_date: input.end_date,
          payment_account_id: input.payment_account_id,
          auto_renewal: input.auto_renewal,
          status: input.status,
          theme: input.theme,
          cancelled_on: input.cancelled_on,
          notes: input.notes?.trim() || null,
        } as UpdateSubscriptionRequest),
      );
      return updated as Subscription;
    } catch (error) {
      console.error('Failed to update subscription', error);
      throw error;
    }
  }

  async deleteSubscription(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/subscriptions/${id}`));
    } catch (error) {
      console.error('Failed to delete subscription', error);
      throw error;
    }
  }

  async listRenewals(subscriptionId: string): Promise<SubscriptionRenewal[]> {
    try {
      const rows = await firstValueFrom(
        this.api.get<SubscriptionRenewalResponse[]>(
          `/subscriptions/${subscriptionId}/renewals`,
        ),
      );
      return rows as SubscriptionRenewal[];
    } catch (error) {
      console.error('Failed to load subscription renewals', error);
      return [];
    }
  }

  async listPriceChanges(subscriptionId: string): Promise<SubscriptionPriceChange[]> {
    try {
      const rows = await firstValueFrom(
        this.api.get<SubscriptionPriceChangeResponse[]>(
          `/subscriptions/${subscriptionId}/price-changes`,
        ),
      );
      return rows as SubscriptionPriceChange[];
    } catch (error) {
      console.error('Failed to load subscription price changes', error);
      return [];
    }
  }

  async listPayments(subscriptionId: string): Promise<SubscriptionPayment[]> {
    try {
      const rows = await firstValueFrom(
        this.api.get<SubscriptionPaymentResponse[]>(
          `/subscriptions/${subscriptionId}/payments`,
        ),
      );
      return rows as SubscriptionPayment[];
    } catch (error) {
      console.error('Failed to load subscription payments', error);
      return [];
    }
  }

  async recordPayment(subscriptionId: string, input: {
    amount: number;
    paid_on: string;
    transaction_id: string | null;
    notes: string | null;
  }): Promise<SubscriptionPayment> {
    try {
      const created = await firstValueFrom(
        this.api.post<SubscriptionPaymentResponse>(
          `/subscriptions/${subscriptionId}/payments`,
          {
            amount: input.amount,
            paid_on: input.paid_on,
            transaction_id: input.transaction_id,
            notes: input.notes?.trim() || null,
          } as RecordPaymentRequest,
        ),
      );
      return created as SubscriptionPayment;
    } catch (error) {
      console.error('Failed to record subscription payment', error);
      throw error;
    }
  }
}
