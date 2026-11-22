import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource as TypeOrmDataSource,
  Repository,
  EntityManager,
} from 'typeorm';
import {
  Subscription,
  SubscriptionPayment,
  SubscriptionRenewal,
  SubscriptionPriceChange,
} from './subscriptions.entity.js';
import type {
  BillingCycle,
  SubscriptionStatus,
  SubscriptionTheme,
} from './subscriptions.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionResponseDto,
  RecordPaymentDto,
  SubscriptionPaymentResponseDto,
  SubscriptionRenewalResponseDto,
  SubscriptionPriceChangeResponseDto,
} from './dto/subscription.dto.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Normalizes a `date` column value to `YYYY-MM-DD`.
 *
 * TypeORM hands back `date` columns as `'YYYY-MM-DD'` strings, but callers may
 * pass a `Date` (entity fixtures, values we just advanced), so both shapes are
 * accepted. Unparsable input yields `null` instead of throwing.
 */
function isoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Integer cents, so float noise never decides whether two amounts differ. */
function toCents(value: number): number {
  return Math.round(Number(value) * 100);
}

/**
 * Adds one billing cycle to a `date` value.
 *
 * Calendar arithmetic runs in UTC so the result is identical regardless of the
 * server timezone (the previous local `setMonth` version drifted by a day in
 * negative UTC offsets). Month-end overflow keeps JavaScript's rollover
 * semantics, matching the Angular `advanceDate` helper exactly.
 */
function advanceRenewalDate(current: Date | string, billingCycle: BillingCycle): Date {
  const iso = isoDate(current) ?? TODAY();
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  switch (billingCycle) {
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'quarterly':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case 'yearly':
      next.setUTCMonth(next.getUTCMonth() + 12);
      break;
  }
  return next;
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
  if (
    n.includes('chatgpt') ||
    n.includes('openai') ||
    n.includes('gpt-') ||
    n.includes('chat gpt')
  )
    return 'mint';
  if (n.includes('spotify')) return 'neon';
  if (
    n.includes('apple') ||
    n.includes('icloud') ||
    n.includes('apple music') ||
    n.includes('apple one')
  )
    return 'rose';
  if (
    n.includes('gym') ||
    n.includes('fitness') ||
    n.includes('cult') ||
    n.includes('workout') ||
    n.includes('crossfit') ||
    n.includes("gold's") ||
    n.includes('anytime')
  )
    return 'amber';
  if (
    n.includes('netflix') ||
    n.includes('youtube') ||
    n.includes('yt music') ||
    n.includes('hotstar')
  )
    return 'scarlet';
  if (
    n.includes('prime') ||
    n.includes('amazon') ||
    n.includes('aws') ||
    n.includes('github') ||
    n.includes('gitlab')
  )
    return 'violet';

  if (c.includes('fitness') || c.includes('health') || c.includes('sport')) return 'amber';
  if (c.includes('music') || c.includes('audio') || c.includes('podcast')) return 'neon';
  if (c.includes('ai') || c.includes('software') || c.includes('developer') || c.includes('cloud'))
    return 'violet';
  if (c.includes('video') || c.includes('streaming') || c.includes('movie')) return 'scarlet';

  return 'slate';
}

export function resolveSubscriptionTheme(
  theme: unknown,
  name: string,
  category?: string,
): SubscriptionTheme {
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

/**
 * A subscription whose expiry date has passed reads back as `expired` even
 * when the stored row still says `active`/`paused` (the Angular client derives
 * the same value on read).
 */
function statusFor(sub: Subscription): SubscriptionStatus {
  const endDate = isoDate(sub.end_date);
  if (
    (sub.status === 'active' || sub.status === 'paused') &&
    endDate &&
    endDate < TODAY()
  ) {
    return 'expired';
  }
  return sub.status;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionPayment)
    private readonly paymentRepository: Repository<SubscriptionPayment>,
    @InjectRepository(SubscriptionRenewal)
    private readonly renewalRepository: Repository<SubscriptionRenewal>,
    @InjectRepository(SubscriptionPriceChange)
    private readonly priceChangeRepository: Repository<SubscriptionPriceChange>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
    @Inject(TransactionsService)
    private readonly transactionsService: TransactionsService,
  ) {}

  async listSubscriptions(ownerId: string): Promise<SubscriptionResponseDto[]> {
    const subs = await this.subscriptionRepository.find({
      where: { owner_id: ownerId },
      order: { next_renewal_date: 'ASC', created_at: 'DESC' },
    });
    return subs.map((s) => this.toResponse(s));
  }

  async getSubscription(
    id: string,
    ownerId: string,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.requireSubscription(id, ownerId);
    return this.toResponse(sub);
  }

  async listRenewals(
    id: string,
    ownerId: string,
  ): Promise<SubscriptionRenewalResponseDto[]> {
    await this.requireSubscription(id, ownerId);
    const rows = await this.renewalRepository.find({
      where: { subscription_id: id, owner_id: ownerId },
      order: { renewed_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toRenewalResponse(r));
  }

  async listPriceChanges(
    id: string,
    ownerId: string,
  ): Promise<SubscriptionPriceChangeResponseDto[]> {
    await this.requireSubscription(id, ownerId);
    const rows = await this.priceChangeRepository.find({
      where: { subscription_id: id, owner_id: ownerId },
      order: { effective_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toPriceChangeResponse(r));
  }

  async listPayments(
    id: string,
    ownerId: string,
  ): Promise<SubscriptionPaymentResponseDto[]> {
    await this.requireSubscription(id, ownerId);
    const rows = await this.paymentRepository.find({
      where: { subscription_id: id, owner_id: ownerId },
      order: { paid_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((p) => this.toPaymentResponse(p));
  }

  async createSubscription(
    ownerId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const name = dto.name ? dto.name.trim() : '';
    if (!name) {
      throw new BadRequestException('Subscription name is required.');
    }
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const startDate = dto.start_date || TODAY();
    const nextRenewal = dto.next_renewal_date || startDate;
    if (nextRenewal < startDate) {
      throw new BadRequestException(
        'Next renewal date must be on or after the start date.',
      );
    }
    if (dto.end_date && dto.end_date < startDate) {
      throw new BadRequestException(
        'Expiry date must be on or after the start date.',
      );
    }

    const status = dto.status ?? 'active';
    const sub = this.subscriptionRepository.create({
      owner_id: ownerId,
      name,
      category: dto.category || 'Other',
      amount,
      billing_cycle: dto.billing_cycle ?? 'monthly',
      start_date: new Date(startDate),
      next_renewal_date: new Date(nextRenewal),
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      payment_account_id: dto.payment_account_id ?? null,
      auto_renewal: dto.auto_renewal ?? true,
      status,
      theme: dto.theme ?? detectSubscriptionTheme(name, dto.category),
      cancelled_on:
        status === 'cancelled' ? new Date(dto.cancelled_on || TODAY()) : null,
      notes: dto.notes ? dto.notes.trim() : null,
    });
    const saved = await this.subscriptionRepository.save(sub);
    return this.toResponse(saved);
  }

  async updateSubscription(
    id: string,
    ownerId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    // Single transaction: the subscription update and its price-change history
    // row commit together (the Angular client rolls the amount back by hand
    // when the history insert fails — a transaction makes that impossible).
    return this.dataSource.transaction(async (manager) => {
      const sub = await manager.findOne(Subscription, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sub) {
        throw new NotFoundException('Subscription not found.');
      }

      if (dto.amount !== undefined && !(roundCurrency(dto.amount) > 0)) {
        throw new BadRequestException('Amount must be greater than zero.');
      }
      if (dto.name !== undefined && !dto.name.trim()) {
        throw new BadRequestException('Subscription name is required.');
      }

      const nextStartDate = dto.start_date || isoDate(sub.start_date) || TODAY();
      const nextRenewalDate =
        dto.next_renewal_date || isoDate(sub.next_renewal_date) || nextStartDate;
      const nextEndDate =
        dto.end_date === undefined ? isoDate(sub.end_date) : dto.end_date || null;
      if (nextRenewalDate < nextStartDate) {
        throw new BadRequestException(
          'Next renewal date must be on or after the start date.',
        );
      }
      if (nextEndDate && nextEndDate < nextStartDate) {
        throw new BadRequestException(
          'Expiry date must be on or after the start date.',
        );
      }

      const previousAmount = sub.amount;
      const nextStatus = dto.status ?? sub.status;

      if (dto.name !== undefined) sub.name = dto.name.trim();
      if (dto.category !== undefined) sub.category = dto.category.trim() || 'Other';
      if (dto.amount !== undefined) sub.amount = roundCurrency(dto.amount);
      if (dto.billing_cycle !== undefined) sub.billing_cycle = dto.billing_cycle;
      if (dto.start_date) sub.start_date = new Date(dto.start_date);
      if (dto.next_renewal_date)
        sub.next_renewal_date = new Date(dto.next_renewal_date);
      if (dto.end_date !== undefined)
        sub.end_date = dto.end_date ? new Date(dto.end_date) : null;
      if (dto.payment_account_id !== undefined)
        sub.payment_account_id = dto.payment_account_id;
      if (dto.auto_renewal !== undefined) sub.auto_renewal = dto.auto_renewal;
      if (dto.status !== undefined) sub.status = dto.status;
      sub.theme =
        dto.theme !== undefined
          ? dto.theme
          : resolveSubscriptionTheme(
              sub.theme,
              dto.name ?? sub.name,
              dto.category ?? sub.category,
            );
      if (dto.notes !== undefined) sub.notes = dto.notes ? dto.notes.trim() : null;
      const cancelledOn =
        nextStatus === 'cancelled'
          ? dto.cancelled_on || isoDate(sub.cancelled_on) || TODAY()
          : dto.status === undefined
            ? isoDate(sub.cancelled_on)
            : null;
      sub.cancelled_on = cancelledOn ? new Date(cancelledOn) : null;

      const saved = await manager.save(sub);

      const amountChanged =
        dto.amount !== undefined &&
        toCents(previousAmount) !== toCents(saved.amount);
      if (amountChanged) {
        const change = manager.create(SubscriptionPriceChange, {
          owner_id: ownerId,
          subscription_id: saved.id,
          old_amount: previousAmount,
          new_amount: saved.amount,
          effective_on: dto.price_change_effective_on || TODAY(),
          notes: null,
        });
        await manager.save(change);
      }

      return this.toResponse(saved);
    });
  }

  async deleteSubscription(id: string, ownerId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const sub = await manager.findOne(Subscription, {
        where: { id, owner_id: ownerId },
      });
      if (!sub) {
        throw new NotFoundException('Subscription not found.');
      }
      // Generated expenses survive the subscription as ordinary manual entries.
      await manager.query(
        `update transactions set source = 'manual', source_ref_id = null
          where owner_id = $1 and source = 'subscription' and source_ref_id = $2`,
        [ownerId, id],
      );
      await manager.remove(sub);
    });
  }

  async recordPayment(
    ownerId: string,
    subscriptionId: string,
    dto: RecordPaymentDto,
  ): Promise<SubscriptionPaymentResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const sub = await manager.findOne(Subscription, {
        where: { id: subscriptionId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sub) {
        throw new NotFoundException('Subscription not found.');
      }

      // Idempotency: a retried request returns the already-committed payment.
      // Checked after the row lock so a concurrent double-submit waits, then
      // finds the winner's row instead of colliding on the primary key.
      if (dto.request_id) {
        const existing = await manager.findOne(SubscriptionPayment, {
          where: { id: dto.request_id },
        });
        if (existing) {
          if (existing.owner_id !== ownerId) {
            throw new NotFoundException('Payment record not found.');
          }
          return this.toPaymentResponse(existing);
        }
      }

      const paidOn = dto.paid_on || TODAY();
      const notes = dto.notes ? dto.notes.trim() : null;

      let transactionId: string;
      if (dto.transaction_id) {
        transactionId = await this.linkExistingTransaction(
          manager,
          ownerId,
          subscriptionId,
          dto.transaction_id,
          amount,
        );
      } else {
        const categoryId = await this.findExpenseCategoryId(
          manager,
          ownerId,
          sub.category,
        );
        const tx = await this.transactionsService.createTransactionInManager(
          manager,
          ownerId,
          {
            amount,
            direction: 'out',
            occurred_on: paidOn,
            category_id: categoryId,
            notes: notes ?? `${sub.name} payment`,
            source: 'subscription',
            source_ref_id: subscriptionId,
            payment_mode: dto.payment_mode ?? (dto.bank_account_id ? 'bank' : 'cash'),
            bank_account_id: dto.bank_account_id ?? null,
          },
        );
        transactionId = tx.id;
      }

      const renewalId = crypto.randomUUID();
      await manager.query(
        `insert into public.subscription_renewals (
          id, owner_id, subscription_id, due_on, renewed_on, amount, status, notes
        ) values ($1,$2,$3,$4,$5,$6,'completed',$7)`,
        [
          renewalId,
          ownerId,
          subscriptionId,
          isoDate(sub.next_renewal_date),
          paidOn,
          amount,
          notes,
        ],
      );

      await manager.query(
        `insert into public.subscription_payments (
          id, owner_id, subscription_id, renewal_id, amount, paid_on, transaction_id, notes
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          dto.request_id ?? crypto.randomUUID(),
          ownerId,
          subscriptionId,
          renewalId,
          amount,
          paidOn,
          transactionId,
          notes,
        ],
      );

      // The explicit new expiry date drives both dates; otherwise each date
      // advances one billing cycle on its own (a subscription with no expiry
      // date keeps having none).
      const nextRenewalDate = dto.new_expiry_date
        ? new Date(dto.new_expiry_date)
        : advanceRenewalDate(sub.next_renewal_date, sub.billing_cycle);
      sub.next_renewal_date = nextRenewalDate;
      if (dto.new_expiry_date) {
        sub.end_date = new Date(dto.new_expiry_date);
      } else if (sub.end_date) {
        sub.end_date = advanceRenewalDate(sub.end_date, sub.billing_cycle);
      }
      await manager.save(sub);

      const savedPayment = await manager.findOne(SubscriptionPayment, {
        where: { renewal_id: renewalId },
      });
      if (!savedPayment) {
        throw new NotFoundException('Payment record not found.');
      }
      return this.toPaymentResponse(savedPayment);
    });
  }

  /**
   * Reuses an existing expense instead of creating one, mirroring the
   * Angular client's validation: only unmanaged or already-this-subscription
   * outgoing transactions at the same amount may be linked.
   */
  private async linkExistingTransaction(
    manager: EntityManager,
    ownerId: string,
    subscriptionId: string,
    transactionId: string,
    amount: number,
  ): Promise<string> {
    const tx = await manager.findOne(Transaction, {
      where: { id: transactionId, owner_id: ownerId },
    });
    if (!tx) {
      throw new NotFoundException('The selected transaction could not be found.');
    }
    if (tx.direction !== 'out') {
      throw new BadRequestException('Only expense transactions can be linked.');
    }
    if (toCents(tx.amount) !== toCents(amount)) {
      throw new BadRequestException(
        'Payment amount must match the selected expense transaction.',
      );
    }
    if (tx.source !== 'manual' && tx.source !== 'subscription') {
      throw new BadRequestException(
        'That transaction is already managed by another feature.',
      );
    }
    if (tx.source === 'subscription' && tx.source_ref_id !== subscriptionId) {
      throw new BadRequestException(
        'That transaction is already linked to another subscription.',
      );
    }
    return tx.id;
  }

  /** Case-insensitive match on the subscription's category name, owner scoped. */
  private async findExpenseCategoryId(
    manager: EntityManager,
    ownerId: string,
    category: string,
  ): Promise<string | null> {
    const rows = await manager.query(
      `select id from categories
        where owner_id = $1 and kind = 'expense' and lower(name) = lower($2)
        limit 1`,
      [ownerId, category],
    );
    return rows?.[0]?.id ?? null;
  }

  private async requireSubscription(
    id: string,
    ownerId: string,
  ): Promise<Subscription> {
    const sub = await this.subscriptionRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found.');
    }
    return sub;
  }

  private toResponse(s: Subscription): SubscriptionResponseDto {
    return {
      id: s.id,
      owner_id: s.owner_id,
      name: s.name,
      category: s.category,
      amount: s.amount,
      billing_cycle: s.billing_cycle,
      start_date: isoDate(s.start_date) ?? '',
      next_renewal_date: isoDate(s.next_renewal_date) ?? '',
      end_date: isoDate(s.end_date),
      payment_account_id: s.payment_account_id,
      auto_renewal: s.auto_renewal,
      status: statusFor(s),
      theme: resolveSubscriptionTheme(s.theme, s.name, s.category),
      cancelled_on: isoDate(s.cancelled_on),
      notes: s.notes,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  }

  private toRenewalResponse(r: SubscriptionRenewal): SubscriptionRenewalResponseDto {
    return {
      id: r.id,
      owner_id: r.owner_id,
      subscription_id: r.subscription_id,
      due_on: isoDate(r.due_on) ?? '',
      renewed_on: isoDate(r.renewed_on) ?? '',
      amount: r.amount,
      status: r.status,
      notes: r.notes,
      created_at: r.created_at,
    };
  }

  private toPriceChangeResponse(
    c: SubscriptionPriceChange,
  ): SubscriptionPriceChangeResponseDto {
    return {
      id: c.id,
      owner_id: c.owner_id,
      subscription_id: c.subscription_id,
      old_amount: c.old_amount,
      new_amount: c.new_amount,
      effective_on: isoDate(c.effective_on) ?? '',
      notes: c.notes,
      created_at: c.created_at,
    };
  }

  private toPaymentResponse(p: SubscriptionPayment): SubscriptionPaymentResponseDto {
    return {
      id: p.id,
      owner_id: p.owner_id,
      subscription_id: p.subscription_id,
      renewal_id: p.renewal_id,
      amount: p.amount,
      paid_on: isoDate(p.paid_on) ?? '',
      transaction_id: p.transaction_id,
      notes: p.notes,
      created_at: p.created_at,
    };
  }
}
