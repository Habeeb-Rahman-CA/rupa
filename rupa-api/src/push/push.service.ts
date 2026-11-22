import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource as TypeOrmDataSource,
  Repository,
  In,
} from 'typeorm';
import * as webPush from 'web-push';
import { ConfigService } from '@nestjs/config';
import {
  PushSubscription,
} from './entities/push-subscription.entity.js';
import {
  PushPreference,
  PushCategory,
} from './entities/push-preference.entity.js';
import {
  PushNotificationLog,
} from './entities/push-notification-log.entity.js';

const RENEWAL_WINDOW_DAYS_DEFAULT = 3;

const NON_SPEND_SOURCES = new Set(['opening', 'transfer', 'wallet_recharge']);

const SAVINGS_NAME_HINTS = [
  'saving', 'emergency', 'mutual', 'gold', 'fixed deposit',
  'sip', 'nps', 'fd', 'investment', 'stock', 'share', 'bond',
];

interface Device {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface BudgetRow {
  id: string;
  owner_id: string;
  name: string;
  category_id: string | null;
  amount: number | string;
  start_date: string;
  end_date: string;
  thresholds: number[];
}

interface BudgetAlert {
  budget: BudgetRow;
  spent: number;
  crossed: number[];
}

interface PushPayload {
  notification: {
    title: string;
    body: string;
    tag: string;
    icon?: string;
    badge?: string;
    requireInteraction?: boolean;
    data: {
      url: string;
      onActionClick: Record<string, { url: string; operation: string }>;
    };
  };
}

function buildPayload(
  title: string,
  body: string,
  tag: string,
  url: string,
): PushPayload {
  return {
    notification: {
      title,
      body,
      tag,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      requireInteraction: true,
      data: {
        url,
        onActionClick: {
          default: { url, operation: 'navigateLastFocusedOrOpen' },
        },
      },
    },
  };
}

function dayIso(offsetDays = 0, timeZone: string): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isEightAM(timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return hour === '08';
}

function isTenPM(timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return hour === '22';
}

function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function fmtAmount(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function isSavingsLike(category: { name: string; kind: string } | undefined): boolean {
  if (!category) return false;
  if (category.kind === 'savings') return true;
  const name = (category.name || '').toLowerCase();
  return SAVINGS_NAME_HINTS.some((hint) => name.includes(hint));
}

function computeBudgetSpent(
  budget: { category_id: string | null; start_date: string; end_date: string },
  transactions: Array<{
    id: string;
    amount: number | string;
    direction: string;
    source: string;
    category_id: string | null;
    occurred_on: string;
  }>,
  categories: Array<{ id: string; name: string; kind: string }>,
): number {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let spent = 0;

  for (const t of transactions) {
    if (NON_SPEND_SOURCES.has(t.source)) continue;
    if (!t.occurred_on) continue;
    if (t.occurred_on < budget.start_date || t.occurred_on > budget.end_date) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);

    const amount = Number(t.amount);
    if (!(amount > 0)) continue;

    if (budget.category_id !== null) {
      if (t.category_id !== budget.category_id) continue;
      if (t.direction === 'out') spent += amount;
      else if (t.direction === 'in') spent -= amount;
      continue;
    }

    const category = t.category_id ? categoryById.get(t.category_id) : undefined;
    if (isSavingsLike(category)) continue;
    if (t.direction === 'out') {
      spent += amount;
    } else if (t.direction === 'in' && category?.kind === 'expense') {
      spent -= amount;
    }
  }

  return Math.max(0, Math.round(spent * 100) / 100);
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    @InjectRepository(PushPreference)
    private readonly preferenceRepository: Repository<PushPreference>,
    @InjectRepository(PushNotificationLog)
    private readonly logRepository: Repository<PushNotificationLog>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    const vapidPublicKey = this.configService.get<string>('push.vapidPublicKey');
    const vapidPrivateKey = this.configService.get<string>('push.vapidPrivateKey');
    const vapidSubject = this.configService.get<string>('push.vapidSubject') ?? 'https://localhost:3000';
    if (vapidPublicKey && vapidPrivateKey) {
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    }
  }

  private get timeZone(): string {
    return this.configService.get<string>('push.timeZone') ?? 'Asia/Kolkata';
  }

  private get renewalWindowDays(): number {
    return this.configService.get<number>('push.renewalWindowDays') ?? RENEWAL_WINDOW_DAYS_DEFAULT;
  }

  private get vapidConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('push.vapidPublicKey') &&
      this.configService.get<string>('push.vapidPrivateKey'),
    );
  }

  async subscribe(
    ownerId: string,
    dto: { endpoint: string; p256dh: string; auth: string; user_agent?: string },
  ): Promise<{ id: string }> {
    const existing = await this.subscriptionRepository.findOne({
      where: { owner_id: ownerId, endpoint: dto.endpoint },
    });
    if (existing) {
      existing.p256dh = dto.p256dh;
      existing.auth = dto.auth;
      existing.user_agent = dto.user_agent ?? null;
      await this.subscriptionRepository.save(existing);
      return { id: existing.id };
    }
    const sub = this.subscriptionRepository.create({
      owner_id: ownerId,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      user_agent: dto.user_agent ?? null,
    });
    const saved = await this.subscriptionRepository.save(sub);
    return { id: saved.id };
  }

  async unsubscribe(ownerId: string, subscriptionId: string): Promise<void> {
    const sub = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId, owner_id: ownerId },
    });
    if (!sub) {
      throw new NotFoundException('Push subscription not found.');
    }
    await this.subscriptionRepository.remove(sub);
  }

  async listSubscriptions(ownerId: string): Promise<PushSubscription[]> {
    return this.subscriptionRepository.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
    });
  }

  async getPreferences(ownerId: string): Promise<{ category: PushCategory; enabled: boolean }[]> {
    const rows = await this.preferenceRepository.find({
      where: { owner_id: ownerId },
    });
    const allCategories: PushCategory[] = [
      'renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm',
    ];
    const byCategory = new Map(rows.map((r) => [r.category, r.enabled]));
    return allCategories.map((category) => ({
      category,
      enabled: byCategory.get(category) ?? true,
    }));
  }

  async updatePreferences(
    ownerId: string,
    preferences: { category: PushCategory; enabled: boolean }[],
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      for (const pref of preferences) {
        await manager.upsert(PushPreference, {
          owner_id: ownerId,
          category: pref.category,
          enabled: pref.enabled,
          updated_at: new Date(),
        }, ['owner_id', 'category']);
      }
    });
  }

  async sendTest(ownerId: string): Promise<{ mode: string; devices: number; sent: number }> {
    const devices = await this.loadDevices([ownerId]);
    const list = devices.get(ownerId) ?? [];
    const sent = await this.sendToOwner(list, ownerId, buildPayload(
      'Test notification',
      'rūpa push notifications are working on this device.',
      `push-test-${Date.now()}`,
      '/settings',
    ));
    return { mode: 'test', devices: list.length, sent };
  }

  /**
   * Scheduled push run. Mirrors the Edge Function `runScheduled`.
   * Called every 15 minutes by PushSchedulerService.
   */
  async runScheduled(): Promise<{
    mode: string;
    candidates: number;
    claimed: number;
    sent: number;
  }> {
    const timeZone = this.timeZone;
    const today = dayIso(0, timeZone);
    const windowEnd = dayIso(this.renewalWindowDays, timeZone);

    // ---- 1. Upcoming subscription renewals ----
    const subs = await this.dataSource.query(
      `select id, owner_id, name, amount, next_renewal_date
       from subscriptions
       where status = 'active'
         and next_renewal_date >= $1
         and next_renewal_date < $2`,
      [today, windowEnd],
    );

    // ---- 2. Wallets at or below their alert threshold ----
    const wallets = await this.dataSource.query(
      `select id, owner_id, name, balance, minimum_balance
       from wallets
       where minimum_balance > 0`,
    );

    // ---- 3. Budgets in their current period ----
    const budgetRows = await this.dataSource.query(
      `select id, owner_id, name, category_id, amount, start_date, end_date, thresholds
       from budgets
       where start_date <= $1
         and end_date >= $1`,
      [today],
    );

    const renewals = (subs ?? []).filter(
      (s: any) => String(s.next_renewal_date) < windowEnd,
    );
    const lowWallets = (wallets ?? []).filter(
      (w: any) => Number(w.balance) <= Number(w.minimum_balance),
    );
    const currentBudgets = ((budgetRows ?? []) as unknown as BudgetRow[]).filter(
      (b) => Array.isArray(b.thresholds) && b.thresholds.length > 0,
    );
    const budgetAlerts = await this.findBudgetAlerts(currentBudgets);

    const ownerIds = [
      ...new Set(
        [...renewals, ...lowWallets, ...budgetAlerts.map((a) => a.budget)].map(
          (row) => row.owner_id,
        ),
      ),
    ];

    const [prefs, deviceMap] = await Promise.all([
      this.loadPrefs(ownerIds),
      this.loadDevices(ownerIds),
    ]);

    let sent = 0;
    let claimed = 0;

    // Renewal reminders
    for (const sub of renewals) {
      if (!this.categoryEnabled(prefs, sub.owner_id, 'renewals')) continue;
      const ref = `sub:${sub.id}:${sub.next_renewal_date}`;
      if (!(await this.claim(sub.owner_id, 'renewals', ref))) continue;
      claimed++;
      const devices = deviceMap.get(sub.owner_id) ?? [];
      sent += await this.sendToOwner(
        devices,
        sub.owner_id,
        buildPayload(
          `Renewal soon: ${sub.name}`,
          `${shortDate(String(sub.next_renewal_date))} · ${fmtAmount(sub.amount)}`,
          `renewals-${sub.id}`,
          '/subscriptions',
        ),
      );
    }

    // Low balance alerts
    for (const wallet of lowWallets) {
      if (!this.categoryEnabled(prefs, wallet.owner_id, 'low_balance')) continue;
      const ref = `wallet:${wallet.id}:${today}`;
      if (!(await this.claim(wallet.owner_id, 'low_balance', ref))) continue;
      claimed++;
      const devices = deviceMap.get(wallet.owner_id) ?? [];
      sent += await this.sendToOwner(
        devices,
        wallet.owner_id,
        buildPayload(
          `Low balance: ${wallet.name}`,
          `${fmtAmount(wallet.balance)} left · alert at ${fmtAmount(wallet.minimum_balance)}`,
          `low-balance-${wallet.id}`,
          '/wallets',
        ),
      );
    }

    // Budget threshold alerts
    for (const alert of budgetAlerts) {
      const { budget, spent, crossed } = alert;
      if (!this.categoryEnabled(prefs, budget.owner_id, 'budget')) continue;

      const highest = crossed[crossed.length - 1];
      let highestWon = false;
      for (const pct of crossed) {
        const ref = `budget:${budget.id}:${String(budget.start_date)}:${pct}`;
        const won = await this.claim(budget.owner_id, 'budget', ref);
        if (won) {
          claimed++;
          if (pct === highest) highestWon = true;
        }
      }
      if (!highestWon) continue;

      const over = highest >= 100;
      const devices = deviceMap.get(budget.owner_id) ?? [];
      sent += await this.sendToOwner(
        devices,
        budget.owner_id,
        buildPayload(
          over ? `Budget exceeded: ${budget.name}` : `Budget at ${highest}%: ${budget.name}`,
          over
            ? `${fmtAmount(spent)} spent of ${fmtAmount(budget.amount)} limit`
            : `${fmtAmount(spent)} of ${fmtAmount(budget.amount)} spent`,
          `budget-${budget.id}`,
          '/budgets',
        ),
      );
    }

    // ---- 5. Daily expense summary (8 AM IST only) ----
    if (isEightAM(timeZone)) {
      const yesterday = dayIso(-1, timeZone);
      const expenseRows = await this.dataSource.query(
        `select owner_id, amount
         from transactions
         where direction = 'out'
           and occurred_on = $1
           and amount > 0`,
        [yesterday],
      );
      const perUser = new Map<string, number>();
      for (const row of expenseRows ?? []) {
        perUser.set(
          row.owner_id,
          (perUser.get(row.owner_id) ?? 0) + Number(row.amount),
        );
      }

      const dailyOwnerIds = [...perUser.keys()];
      const [dailyPrefs, dailyDevices] = await Promise.all([
        this.loadPrefs(dailyOwnerIds),
        this.loadDevices(dailyOwnerIds),
      ]);

      const amountFmt = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      });

      for (const [ownerId, totalAmount] of perUser) {
        if (!this.categoryEnabled(dailyPrefs, ownerId, 'daily_expense')) continue;
        const ref = `daily-expense:${yesterday}`;
        if (!(await this.claim(ownerId, 'daily_expense', ref))) continue;
        claimed++;
        const devices = dailyDevices.get(ownerId) ?? [];
        sent += await this.sendToOwner(
          devices,
          ownerId,
          buildPayload(
            `Yesterday's expenses`,
            `You spent ${amountFmt.format(totalAmount)} yesterday`,
            `daily-expense-${yesterday}`,
            '/dashboard',
          ),
        );
      }
    }

    // ---- 6. Daily confirm reminder (10 PM IST only) ----
    if (isTenPM(timeZone)) {
      const todayStr = dayIso(0, timeZone);
      const confirmOwnerIds = [
        ...new Set(
          [...renewals, ...lowWallets, ...budgetAlerts.map((a) => a.budget)]
            .map((row) => row.owner_id),
        ),
      ];
      const [confirmPrefs, confirmDevices] = await Promise.all([
        this.loadPrefs(confirmOwnerIds),
        this.loadDevices(confirmOwnerIds),
      ]);

      for (const ownerId of confirmOwnerIds) {
        if (!this.categoryEnabled(confirmPrefs, ownerId, 'daily_confirm')) continue;
        const ref = `daily-confirm:${todayStr}`;
        if (!(await this.claim(ownerId, 'daily_confirm', ref))) continue;
        claimed++;
        const devices = confirmDevices.get(ownerId) ?? [];
        sent += await this.sendToOwner(
          devices,
          ownerId,
          buildPayload(
            'Confirm today’s transactions',
            'Have you added all your expenses and income for today?',
            `daily-confirm-${todayStr}`,
            '/dashboard',
          ),
        );
      }
    }

    // Cleanup old de-duplication log (400 days)
    const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await this.dataSource.query(
      `delete from push_notification_log where created_at < $1`,
      [cutoff],
    );

    return {
      mode: 'scheduled',
      candidates: renewals.length + lowWallets.length + budgetAlerts.length,
      claimed,
      sent,
    };
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async loadPrefs(
    ownerIds: string[],
  ): Promise<Map<string, Map<PushCategory, boolean>>> {
    const map = new Map<string, Map<PushCategory, boolean>>();
    if (ownerIds.length === 0) return map;
    const rows = await this.preferenceRepository.find({
      where: { owner_id: In(ownerIds) },
    });
    for (const row of rows) {
      if (!map.has(row.owner_id)) map.set(row.owner_id, new Map());
      map.get(row.owner_id)!.set(row.category, row.enabled);
    }
    return map;
  }

  private categoryEnabled(
    prefs: Map<string, Map<PushCategory, boolean>>,
    ownerId: string,
    category: PushCategory,
  ): boolean {
    return prefs.get(ownerId)?.get(category) ?? true;
  }

  private async loadDevices(
    ownerIds: string[],
  ): Promise<Map<string, Device[]>> {
    const map = new Map<string, Device[]>();
    if (ownerIds.length === 0) return map;
    const rows = await this.subscriptionRepository.find({
      where: { owner_id: In(ownerIds) },
    });
    for (const row of rows) {
      const list = map.get(row.owner_id) ?? [];
      list.push({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      });
      map.set(row.owner_id, list);
    }
    return map;
  }

  private async claim(
    ownerId: string,
    category: PushCategory,
    ref: string,
  ): Promise<boolean> {
    const existing = await this.logRepository.findOne({
      where: { owner_id: ownerId, category, ref },
    });
    if (existing) return false;
    await this.logRepository.save(this.logRepository.create({
      owner_id: ownerId,
      category,
      ref,
    }));
    return true;
  }

  private async sendToOwner(
    devices: Device[],
    ownerId: string,
    body: PushPayload,
  ): Promise<number> {
    let sent = 0;
    for (const device of devices) {
      if (!this.vapidConfigured) {
        this.logger.error('push: VAPID keys are not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
        return sent;
      }
      try {
        await webPush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(body),
          { TTL: 24 * 60 * 60 },
        );
        sent++;
        await this.subscriptionRepository.update(device.id, { updated_at: new Date() });
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          this.logger.warn(`push: removing expired subscription ${device.id} (${statusCode})`);
          await this.subscriptionRepository.delete(device.id);
        } else {
          this.logger.error(`push: send failed for device ${device.id}`, err);
        }
      }
    }
    return sent;
  }

  private async findBudgetAlerts(
    budgets: BudgetRow[],
  ): Promise<BudgetAlert[]> {
    if (budgets.length === 0) return [];

    const ownerIds = [...new Set(budgets.map((b) => b.owner_id))];
    const minStart = budgets.map((b) => String(b.start_date)).sort()[0];
    const maxEnd = budgets.map((b) => String(b.end_date)).sort().slice(-1)[0];

    const [txRows, catRows] = await Promise.all([
      this.dataSource.query(
        `select id, owner_id, amount, direction, source, category_id, occurred_on
         from transactions
         where owner_id = any($1::uuid[])
           and occurred_on >= $2
           and occurred_on <= $3`,
        [ownerIds, minStart, maxEnd],
      ),
      this.dataSource.query(
        `select id, owner_id, name, kind
         from categories
         where owner_id = any($1::uuid[])`,
        [ownerIds],
      ),
    ]);

    const transactionsByOwner = new Map<string, any[]>();
    for (const row of txRows ?? []) {
      const list = transactionsByOwner.get(row.owner_id) ?? [];
      list.push(row);
      transactionsByOwner.set(row.owner_id, list);
    }
    const categoriesByOwner = new Map<string, any[]>();
    for (const row of catRows ?? []) {
      const list = categoriesByOwner.get(row.owner_id) ?? [];
      list.push(row);
      categoriesByOwner.set(row.owner_id, list);
    }

    const alerts: BudgetAlert[] = [];
    for (const budget of budgets) {
      const spent = computeBudgetSpent(
        budget,
        transactionsByOwner.get(budget.owner_id) ?? [],
        categoriesByOwner.get(budget.owner_id) ?? [],
      );
      const amount = Number(budget.amount);
      if (!(amount > 0)) continue;

      const crossed = (Array.isArray(budget.thresholds) ? budget.thresholds : [])
        .filter((pct) => Number.isFinite(pct) && spent >= (amount * pct) / 100)
        .sort((a, b) => a - b);
      if (crossed.length === 0) continue;

      alerts.push({ budget, spent, crossed });
    }
    return alerts;
  }
}
