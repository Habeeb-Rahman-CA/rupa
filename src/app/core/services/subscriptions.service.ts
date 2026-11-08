import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Subscription,
  SubscriptionBillingCycle,
  SubscriptionPayment,
  SubscriptionPriceChange,
  SubscriptionRenewal,
  SubscriptionStatus,
  SubscriptionTheme,
  Transaction,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { CategoriesService } from './categories.service';
import { isEqualCurrency, roundCurrency } from '../../shared/utils/currency-utils';

export interface CreateSubscriptionInput {
  name: string;
  category: string;
  amount: number;
  billing_cycle: SubscriptionBillingCycle;
  start_date: string;
  next_renewal_date: string;
  end_date?: string | null;
  payment_account_id?: string | null;
  auto_renewal?: boolean;
  status?: SubscriptionStatus;
  theme?: SubscriptionTheme;
  cancelled_on?: string | null;
  notes?: string | null;
}

export interface UpdateSubscriptionInput {
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
  price_change_effective_on?: string;
}

const VALID_SUBSCRIPTION_THEMES = new Set<SubscriptionTheme>([
  'mint',
  'neon',
  'rose',
  'amber',
  'scarlet',
  'slate',
  'violet',
]);

const LEGACY_THEME_MAP: Record<string, SubscriptionTheme> = {
  copper: 'amber',
  claude: 'amber',
  chatgpt: 'mint',
  emerald: 'mint',
  spotify: 'neon',
  apple: 'rose',
  gym: 'amber',
  sunset: 'amber',
  netflix: 'scarlet',
  youtube: 'scarlet',
  midnight: 'slate',
  dark: 'slate',
  indigo: 'violet',
  lavender: 'violet',
};

export function isSubscriptionTheme(theme: unknown): theme is SubscriptionTheme {
  return typeof theme === 'string' && VALID_SUBSCRIPTION_THEMES.has(theme as SubscriptionTheme);
}

export function detectSubscriptionTheme(name: string, category?: string): SubscriptionTheme {
  const n = (name || '').toLowerCase().trim();
  const c = (category || '').toLowerCase().trim();

  if (n.includes('claude') || n.includes('anthropic')) return 'amber';
  if (n.includes('chatgpt') || n.includes('openai') || n.includes('gpt-') || n.includes('chat gpt')) return 'mint';
  if (n.includes('spotify')) return 'neon';
  if (n.includes('apple') || n.includes('icloud') || n.includes('apple music') || n.includes('apple one')) return 'rose';
  if (n.includes('gym') || n.includes('fitness') || n.includes('cult') || n.includes('workout') || n.includes('crossfit') || n.includes('gold\'s') || n.includes('anytime')) return 'amber';
  if (n.includes('netflix') || n.includes('youtube') || n.includes('yt music') || n.includes('hotstar')) return 'scarlet';
  if (n.includes('prime') || n.includes('amazon') || n.includes('aws') || n.includes('github') || n.includes('gitlab')) return 'violet';

  if (c.includes('fitness') || c.includes('health') || c.includes('sport')) return 'amber';
  if (c.includes('music') || c.includes('audio') || c.includes('podcast')) return 'neon';
  if (c.includes('ai') || c.includes('software') || c.includes('developer') || c.includes('cloud')) return 'violet';
  if (c.includes('video') || c.includes('streaming') || c.includes('movie')) return 'scarlet';

  return 'slate';
}

export function resolveSubscriptionTheme(theme: unknown, name: string, category?: string): SubscriptionTheme {
  if (typeof theme === 'string') {
    if (VALID_SUBSCRIPTION_THEMES.has(theme as SubscriptionTheme)) {
      return theme as SubscriptionTheme;
    }
    if (theme in LEGACY_THEME_MAP) {
      return LEGACY_THEME_MAP[theme];
    }
  }
  return detectSubscriptionTheme(name, category);
}

export interface RecordSubscriptionPaymentInput {
  subscription_id: string;
  amount: number;
  paid_on: string;
  /** New expiry date after this renewal; drives both end_date and next_renewal_date. */
  new_expiry_date?: string | null;
  transaction_id?: string | null;
  payment_mode?: 'cash' | 'bank';
  bank_account_id?: string | null;
  notes?: string | null;
}

export interface SubscriptionReminder {
  subscription: Subscription;
  daysUntilRenewal: number;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly _subscriptions = signal<Subscription[]>([]);
  private readonly _payments = signal<SubscriptionPayment[]>([]);
  private readonly _renewals = signal<SubscriptionRenewal[]>([]);
  private readonly _priceChanges = signal<SubscriptionPriceChange[]>([]);
  private readonly _isLoading = signal(false);

  readonly subscriptions = this._subscriptions.asReadonly();
  readonly payments = this._payments.asReadonly();
  readonly renewals = this._renewals.asReadonly();
  readonly priceChanges = this._priceChanges.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  readonly renewalReminders = computed<SubscriptionReminder[]>(() =>
    this._subscriptions()
      .map((subscription) => ({
        subscription,
        daysUntilRenewal: daysBetween(todayIso(), subscription.next_renewal_date),
      }))
      .filter(
        ({ subscription, daysUntilRenewal }) =>
          (this.statusFor(subscription) === 'active' || this.statusFor(subscription) === 'paused') &&
          (daysUntilRenewal === 7 || daysUntilRenewal === 1),
      )
      .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal),
  );

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this.clear();
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.clear();
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [subscriptions, payments, renewals, priceChanges] = await Promise.all([
          this.supabase.client.from('subscriptions').select('*').order('next_renewal_date', { ascending: true }),
          this.supabase.client.from('subscription_payments').select('*').order('paid_on', { ascending: false }),
          this.supabase.client.from('subscription_renewals').select('*').order('renewed_on', { ascending: false }),
          this.supabase.client
            .from('subscription_price_changes')
            .select('*')
            .order('effective_on', { ascending: false }),
        ]);

        if (subscriptions.error) throw subscriptions.error;
        if (payments.error) throw payments.error;
        if (renewals.error) throw renewals.error;
        if (priceChanges.error) throw priceChanges.error;

        let loadedSubscriptions = (subscriptions.data ?? []) as Subscription[];
        const expiredIds = loadedSubscriptions
          .filter(
            (subscription) =>
              (subscription.status === 'active' || subscription.status === 'paused') &&
              !!subscription.end_date &&
              subscription.end_date < todayIso(),
          )
          .map((subscription) => subscription.id);
        if (expiredIds.length > 0) {
          const { error: expiryError } = await this.supabase.client
            .from('subscriptions')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .in('id', expiredIds);
          if (expiryError) {
            console.error('Failed to persist expired subscription statuses', expiryError);
          } else {
            loadedSubscriptions = loadedSubscriptions.map((subscription) =>
              expiredIds.includes(subscription.id) ? { ...subscription, status: 'expired' as const } : subscription,
            );
          }
        }
        this._subscriptions.set(
          loadedSubscriptions.map((subscription) => {
            const rawTheme = (subscription as unknown as { theme?: unknown }).theme;
            return {
              ...subscription,
              theme: resolveSubscriptionTheme(rawTheme, subscription.name, subscription.category),
              amount: Number(subscription.amount),
              status: this.statusFor(subscription),
            };
          }),
        );
        this._payments.set(
          ((payments.data ?? []) as SubscriptionPayment[]).map((payment) => ({
            ...payment,
            amount: Number(payment.amount),
          })),
        );
        this._renewals.set(
          ((renewals.data ?? []) as SubscriptionRenewal[]).map((renewal) => ({
            ...renewal,
            amount: Number(renewal.amount),
          })),
        );
        this._priceChanges.set(
          ((priceChanges.data ?? []) as SubscriptionPriceChange[]).map((change) => ({
            ...change,
            old_amount: Number(change.old_amount),
            new_amount: Number(change.new_amount),
          })),
        );
      } catch (error) {
        console.error('Failed to load subscriptions', error);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const ownerId = this.requireUserId();
    this.validateInput(input);
    const theme = input.theme && isSubscriptionTheme(input.theme)
      ? input.theme
      : detectSubscriptionTheme(input.name, input.category);

    const payload: Record<string, unknown> = {
      owner_id: ownerId,
      name: input.name.trim(),
      category: input.category.trim() || 'Other',
      amount: roundCurrency(input.amount),
      billing_cycle: input.billing_cycle,
      start_date: input.start_date,
      next_renewal_date: input.next_renewal_date,
      end_date: input.end_date || null,
      payment_account_id: input.payment_account_id || null,
      auto_renewal: input.auto_renewal ?? true,
      status: input.status ?? 'active',
      theme,
      cancelled_on: input.status === 'cancelled' ? input.cancelled_on || todayIso() : null,
      notes: input.notes?.trim() || null,
    };

    let result = await this.supabase.client
      .from('subscriptions')
      .insert(payload)
      .select()
      .single();

    if (result.error && (result.error.message?.includes('theme') || result.error.code === 'PGRST204')) {
      delete payload['theme'];
      result = await this.supabase.client
        .from('subscriptions')
        .insert(payload)
        .select()
        .single();
    }
    if (result.error) throw result.error;

    const data = result.data as Record<string, unknown>;
    const created: Subscription = {
      ...(data as unknown as Subscription),
      theme,
      amount: Number(data['amount']),
      status: this.statusFor(data as unknown as Subscription),
    };
    this._subscriptions.update((list) => [created, ...list]);
    return created;
  }

  async update(id: string, changes: UpdateSubscriptionInput): Promise<Subscription | null> {
    const current = this._subscriptions().find((subscription) => subscription.id === id);
    if (!current) return null;
    const ownerId = this.requireUserId();

    if (changes.amount !== undefined && !(changes.amount > 0)) {
      throw new Error('Amount must be greater than zero.');
    }
    if (changes.name !== undefined && !changes.name.trim()) {
      throw new Error('Subscription name is required.');
    }
    const nextStartDate = changes.start_date ?? current.start_date;
    const nextRenewalDate = changes.next_renewal_date ?? current.next_renewal_date;
    const nextEndDate = changes.end_date === undefined ? current.end_date : changes.end_date;
    if (nextRenewalDate < nextStartDate) {
      throw new Error('Next renewal date must be on or after the start date.');
    }
    if (nextEndDate && nextEndDate < nextStartDate) {
      throw new Error('Expiry date must be on or after the start date.');
    }

    const nextStatus = changes.status ?? current.status;
    const targetTheme: SubscriptionTheme = changes.theme !== undefined
      ? (isSubscriptionTheme(changes.theme) ? changes.theme : current.theme)
      : (changes.name ? resolveSubscriptionTheme(current.theme, changes.name, changes.category ?? current.category) : current.theme);

    const payload: Record<string, unknown> = {
      ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
      ...(changes.category === undefined ? {} : { category: changes.category.trim() || 'Other' }),
      ...(changes.amount === undefined ? {} : { amount: roundCurrency(changes.amount) }),
      ...(changes.billing_cycle === undefined ? {} : { billing_cycle: changes.billing_cycle }),
      ...(changes.start_date === undefined ? {} : { start_date: changes.start_date }),
      ...(changes.next_renewal_date === undefined ? {} : { next_renewal_date: changes.next_renewal_date }),
      ...(changes.end_date === undefined ? {} : { end_date: changes.end_date || null }),
      ...(changes.payment_account_id === undefined
        ? {}
        : { payment_account_id: changes.payment_account_id || null }),
      ...(changes.auto_renewal === undefined ? {} : { auto_renewal: changes.auto_renewal }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
      ...(changes.theme === undefined ? {} : { theme: targetTheme }),
      ...(changes.notes === undefined ? {} : { notes: changes.notes?.trim() || null }),
      cancelled_on:
        nextStatus === 'cancelled'
          ? changes.cancelled_on ?? current.cancelled_on ?? todayIso()
          : changes.status === undefined
            ? current.cancelled_on
            : null,
      updated_at: new Date().toISOString(),
    };

    let updateRes = await this.supabase.client
      .from('subscriptions')
      .update(payload)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (updateRes.error && (updateRes.error.message?.includes('theme') || updateRes.error.code === 'PGRST204')) {
      delete payload['theme'];
      updateRes = await this.supabase.client
        .from('subscriptions')
        .update(payload)
        .eq('id', id)
        .eq('owner_id', ownerId)
        .select()
        .single();
    }
    if (updateRes.error) throw updateRes.error;

    const data = updateRes.data as Record<string, unknown>;
    const updated: Subscription = {
      ...(data as unknown as Subscription),
      theme: targetTheme,
      amount: Number(data['amount']),
      status: this.statusFor(data as unknown as Subscription),
    };
    const amountChanged = changes.amount !== undefined && !isEqualCurrency(Number(current.amount), changes.amount);

    if (amountChanged) {
      const { data: priceChange, error: priceError } = await this.supabase.client
        .from('subscription_price_changes')
        .insert({
          owner_id: ownerId,
          subscription_id: id,
          old_amount: Number(current.amount),
          new_amount: Number(changes.amount),
          effective_on: changes.price_change_effective_on || todayIso(),
        })
        .select()
        .single();
      if (priceError) {
        await this.supabase.client.from('subscriptions').update({ amount: current.amount }).eq('id', id);
        throw priceError;
      }
      this._priceChanges.update((list) => [
        {
          ...(priceChange as SubscriptionPriceChange),
          old_amount: Number(priceChange.old_amount),
          new_amount: Number(priceChange.new_amount),
        },
        ...list,
      ]);
    }

    this._subscriptions.update((list) => list.map((item) => (item.id === id ? updated : item)));
    return updated;
  }

  async updateTheme(id: string, theme: SubscriptionTheme): Promise<Subscription | null> {
    return this.update(id, { theme });
  }

  async recordPayment(input: RecordSubscriptionPaymentInput): Promise<SubscriptionPayment> {
    if (!(input.amount > 0)) throw new Error('Payment amount must be greater than zero.');
    const subscription = this._subscriptions().find((item) => item.id === input.subscription_id);
    if (!subscription) throw new Error('Subscription not found.');
    const ownerId = this.requireUserId();
    let transactionId = input.transaction_id ?? null;
    let createdTransaction: Transaction | null = null;

    if (transactionId) {
      const { data: transaction, error } = await this.supabase.client
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!transaction) throw new Error('The selected transaction could not be found.');
      if (transaction.direction !== 'out') throw new Error('Only expense transactions can be linked.');
      if (!isEqualCurrency(Number(transaction.amount), input.amount)) {
        throw new Error('Payment amount must match the selected expense transaction.');
      }
      if (transaction.source !== 'manual' && transaction.source !== 'subscription') {
        throw new Error('That transaction is already managed by another feature.');
      }
      if (transaction.source === 'subscription' && transaction.source_ref_id !== subscription.id) {
        throw new Error('That transaction is already linked to another subscription.');
      }
    } else {
      const matchingCategory = this.categoriesService
        .categories()
        .find((category) => category.kind === 'expense' && category.name.toLowerCase() === subscription.category.toLowerCase());
      createdTransaction = await this.transactionsService.create({
        amount: input.amount,
        direction: 'out',
        occurred_on: input.paid_on,
        category_id: matchingCategory?.id ?? null,
        notes: input.notes?.trim() || `${subscription.name} payment`,
        source: 'subscription',
        source_ref_id: subscription.id,
        payment_mode: input.payment_mode ?? (input.bank_account_id ? 'bank' : 'cash'),
        bank_account_id: input.bank_account_id ?? null,
      });
      transactionId = createdTransaction.id;
    }

    let renewal: SubscriptionRenewal | null = null;
    try {
      const renewalResult = await this.supabase.client
        .from('subscription_renewals')
        .insert({
          owner_id: ownerId,
          subscription_id: subscription.id,
          due_on: subscription.next_renewal_date,
          renewed_on: input.paid_on,
          amount: roundCurrency(input.amount),
          status: 'completed',
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (renewalResult.error) throw renewalResult.error;
      renewal = { ...(renewalResult.data as SubscriptionRenewal), amount: Number(renewalResult.data.amount) };

      const paymentResult = await this.supabase.client
        .from('subscription_payments')
        .insert({
          owner_id: ownerId,
          subscription_id: subscription.id,
          renewal_id: renewal.id,
          amount: roundCurrency(input.amount),
          paid_on: input.paid_on,
          transaction_id: transactionId,
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (paymentResult.error) throw paymentResult.error;

      const payment = { ...(paymentResult.data as SubscriptionPayment), amount: Number(paymentResult.data.amount) };
      // Expiry and renewal are the same date in this app: the explicit new
      // expiry date wins; otherwise fall back to advancing one billing cycle.
      const nextRenewalDate =
        input.new_expiry_date ?? advanceDate(subscription.next_renewal_date, subscription.billing_cycle);
      const nextEndDate =
        input.new_expiry_date ??
        (subscription.end_date ? advanceDate(subscription.end_date, subscription.billing_cycle) : null);
      const updated = await this.update(subscription.id, {
        next_renewal_date: nextRenewalDate,
        ...(nextEndDate ? { end_date: nextEndDate } : {}),
      });
      if (updated) this._subscriptions.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      this._renewals.update((list) => [renewal!, ...list]);
      this._payments.update((list) => [payment, ...list]);
      await this.transactionsService.refresh();
      return payment;
    } catch (error) {
      if (renewal) await this.supabase.client.from('subscription_renewals').delete().eq('id', renewal.id);
      if (createdTransaction) {
        try {
          await this.transactionsService.delete(createdTransaction.id);
        } catch {}
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const current = this._subscriptions().find((item) => item.id === id);
    if (!current) return;
    const generatedTransactionIds = this._payments()
      .filter((payment) => payment.subscription_id === id && payment.transaction_id)
      .map((payment) => payment.transaction_id!);
    const { error } = await this.supabase.client.from('subscriptions').delete().eq('id', id);
    if (error) throw error;
    for (const transactionId of generatedTransactionIds) {
      const { error: cleanupError } = await this.supabase.client
        .from('transactions')
        .update({ source: 'manual', source_ref_id: null })
        .eq('id', transactionId)
        .eq('source', 'subscription')
        .eq('source_ref_id', id);
      if (cleanupError) console.error('Failed to unlink subscription transaction', cleanupError);
    }
    this._subscriptions.update((list) => list.filter((item) => item.id !== id));
    this._payments.update((list) => list.filter((item) => item.subscription_id !== id));
    this._renewals.update((list) => list.filter((item) => item.subscription_id !== id));
    this._priceChanges.update((list) => list.filter((item) => item.subscription_id !== id));
  }

  statusFor(subscription: Subscription): SubscriptionStatus {
    if (
      (subscription.status === 'active' || subscription.status === 'paused') &&
      subscription.end_date &&
      subscription.end_date < todayIso()
    ) {
      return 'expired';
    }
    return subscription.status;
  }

  private validateInput(input: CreateSubscriptionInput): void {
    if (!input.name.trim()) throw new Error('Subscription name is required.');
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    if (input.next_renewal_date < input.start_date) {
      throw new Error('Next renewal date must be on or after the start date.');
    }
    if (input.end_date && input.end_date < input.start_date) {
      throw new Error('Expiry date must be on or after the start date.');
    }
  }

  private clear(): void {
    this._subscriptions.set([]);
    this._payments.set([]);
    this._renewals.set([]);
    this._priceChanges.set([]);
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}

export function monthlyEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  const yearly = yearlyEquivalent(amount, cycle);
  return roundCurrency(yearly / 12);
}

export function yearlyEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  const multiplier: Record<SubscriptionBillingCycle, number> = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
  };
  return roundCurrency(amount * multiplier[cycle]);
}

export function daysBetween(from: string, to: string): number {
  const start = parseIsoDate(from).getTime();
  const end = parseIsoDate(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

function advanceDate(date: string, cycle: SubscriptionBillingCycle): string {
  const parsed = parseIsoDate(date);
  if (cycle === 'weekly') parsed.setDate(parsed.getDate() + 7);
  if (cycle === 'monthly') parsed.setMonth(parsed.getMonth() + 1);
  if (cycle === 'quarterly') parsed.setMonth(parsed.getMonth() + 3);
  if (cycle === 'yearly') parsed.setFullYear(parsed.getFullYear() + 1);
  return toIsoDate(parsed);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  return toIsoDate(new Date());
}
