// =============================================================================
// Edge Function: push-notifications
//
// The single sending backend for Web Push. VAPID signing happens here; the
// private key exists only as a function secret (never in the app or repo).
//
// Two modes:
//   1. Scheduled (pg_cron + pg_net): header `x-cron-secret` must match the
//      random secret seeded into push_config by migration 0017. Runs the
//      renewal, low-balance and budget-threshold checks and pushes to every
//      subscribed device.
//   2. Test (the app): `Authorization: Bearer <user JWT>` (sent automatically
//      by supabase-js `functions.invoke`) and body `{ action: "test" }`.
//      Sends one test notification to the caller's own devices.
//
// Deploy with JWT verification OFF (the function does its own auth):
//   supabase functions deploy push-notifications --no-verify-jwt
// or toggle "Verify JWT" off in the dashboard's function settings.
// =============================================================================

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://kulwhzrhmpcdgwgamjzx.supabase.co';

/** Time zone the app's date-only values live in (machine TZ is IST). */
const APP_TIME_ZONE = Deno.env.get('APP_TIME_ZONE') ?? 'Asia/Kolkata';

/** How many days ahead a renewal reminder is sent (inclusive of today). */
const RENEWAL_WINDOW_DAYS = 3;

/** Notification categories the user can toggle in the app. */
type Category = 'renewals' | 'low_balance' | 'budget' | 'daily_expense';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

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
  /** Every milestone the spending has reached, ascending (last = highest). */
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

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Today's date (YYYY-MM-DD) in the app's time zone, optionally shifted. */
function dayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True when the current time in APP_TIME_ZONE is 08:00 (used for the daily
 *  expense summary cron which runs every 15 minutes but should only send
 *  once per day at 8 AM). */
function isEightAM(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return hour === '08';
}

/** '2026-11-20' → 'Nov 20' (date-only string, no timezone math). */
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

function payload(
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
        // Handled by ngsw-worker.js: focus an open app window and navigate
        // it, or open a new one if none is running.
        onActionClick: {
          default: { url, operation: 'navigateLastFocusedOrOpen' },
        },
      },
    },
  };
}

function adminClient(): SupabaseClient {
  return createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** enabled unless an explicit opt-out row exists. */
async function loadPrefs(
  admin: SupabaseClient,
  ownerIds: string[],
): Promise<Map<string, Map<Category, boolean>>> {
  const map = new Map<string, Map<Category, boolean>>();
  if (ownerIds.length === 0) return map;
  const { data } = await admin
    .from('push_preferences')
    .select('owner_id, category, enabled')
    .in('owner_id', ownerIds);
  for (const row of data ?? []) {
    if (!map.has(row.owner_id)) map.set(row.owner_id, new Map());
    map.get(row.owner_id)!.set(row.category as Category, row.enabled);
  }
  return map;
}

function categoryEnabled(
  prefs: Map<string, Map<Category, boolean>>,
  ownerId: string,
  category: Category,
): boolean {
  return prefs.get(ownerId)?.get(category) ?? true;
}

async function loadDevices(
  admin: SupabaseClient,
  ownerIds: string[],
): Promise<Map<string, Device[]>> {
  const map = new Map<string, Device[]>();
  if (ownerIds.length === 0) return map;
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, owner_id, endpoint, p256dh, auth')
    .in('owner_id', ownerIds);
  for (const row of data ?? []) {
    const list = map.get(row.owner_id) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    map.set(row.owner_id, list);
  }
  return map;
}

/**
 * Claim the right to send this notification. Returns true when this run won
 * the claim (row inserted); false when it was already claimed earlier.
 */
async function claim(
  admin: SupabaseClient,
  ownerId: string,
  category: Category,
  ref: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('push_notification_log')
    .upsert(
      { owner_id: ownerId, category, ref },
      { onConflict: 'owner_id,category,ref', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('push: claim failed', error);
    return false; // fail closed — never double-send
  }
  return data !== null;
}

/** Send to every registered device of one owner. Removes dead endpoints. */
async function sendToOwner(
  admin: SupabaseClient,
  devices: Device[],
  ownerId: string,
  body: PushPayload,
): Promise<number> {
  let sent = 0;
  for (const device of devices) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('push: VAPID keys are not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
      return sent;
    }
    try {
      await webPush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(body),
        { TTL: 24 * 60 * 60 }, // drop undeliverable messages after a day
      );
      sent++;
      await admin
        .from('push_subscriptions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', device.id);
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        // Subscription expired or was cancelled by the browser → forget it.
        console.warn(`push: removing expired subscription ${device.id} (${status})`);
        await admin.from('push_subscriptions').delete().eq('id', device.id);
      } else {
        console.error(`push: send failed for device ${device.id}`, err);
      }
    }
  }
  return sent;
}

// --------------------------- budget accounting ------------------------------
// Mirrors computeBudgetSpent + isSavingsCategory in
// src/app/shared/utils/budget-utils.ts and domain.models.ts — keep in sync.

const NON_SPEND_SOURCES = new Set(['opening', 'transfer', 'wallet_recharge']);

const SAVINGS_NAME_HINTS = [
  'saving', 'emergency', 'mutual', 'gold', 'fixed deposit',
  'sip', 'nps', 'fd', 'investment', 'stock', 'share', 'bond',
];

/** kind === 'savings' or a legacy savings-style category name. */
function isSavingsLike(category: { name: string; kind: string } | undefined): boolean {
  if (!category) return false;
  if (category.kind === 'savings') return true;
  const name = (category.name || '').toLowerCase();
  return SAVINGS_NAME_HINTS.some((hint) => name.includes(hint));
}

/**
 * Spent amount for one budget period — the app's rules:
 * actual expenses only; transfers / wallet recharges / opening rows
 * excluded; wallet spending counted once; refunds (incoming money in an
 * expense category) netted; each transaction id counted at most once.
 */
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
      spent -= amount; // refund of a purchase
    }
  }

  return Math.max(0, Math.round(spent * 100) / 100);
}

/** Current-period budgets with milestones → their crossed thresholds. */
async function findBudgetAlerts(
  admin: SupabaseClient,
  budgets: BudgetRow[],
): Promise<BudgetAlert[]> {
  if (budgets.length === 0) return [];

  const ownerIds = [...new Set(budgets.map((b) => b.owner_id))];
  const minStart = budgets.map((b) => String(b.start_date)).sort()[0];
  const maxEnd = budgets.map((b) => String(b.end_date)).sort().slice(-1)[0];

  const [txResult, catResult] = await Promise.all([
    admin
      .from('transactions')
      .select('id, owner_id, amount, direction, source, category_id, occurred_on')
      .in('owner_id', ownerIds)
      .gte('occurred_on', minStart)
      .lte('occurred_on', maxEnd),
    admin
      .from('categories')
      .select('id, owner_id, name, kind')
      .in('owner_id', ownerIds),
  ]);

  if (txResult.error || catResult.error) {
    console.error('push: budget queries failed', txResult.error ?? catResult.error);
    return [];
  }

  const transactionsByOwner = new Map<string, any[]>();
  for (const row of txResult.data ?? []) {
    const list = transactionsByOwner.get(row.owner_id) ?? [];
    list.push(row);
    transactionsByOwner.set(row.owner_id, list);
  }
  const categoriesByOwner = new Map<string, any[]>();
  for (const row of catResult.data ?? []) {
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

async function runScheduled(admin: SupabaseClient): Promise<Response> {
  const today = dayIso(0);
  const windowEnd = dayIso(RENEWAL_WINDOW_DAYS); // exclusive → 3 days incl. today

  // ---- 1. Upcoming subscription renewals -----------------------------------
  const { data: subs, error: subsError } = await admin
    .from('subscriptions')
    .select('id, owner_id, name, amount, next_renewal_date')
    .eq('status', 'active')
    .gte('next_renewal_date', today)
    .lt('next_renewal_date', windowEnd);

  // ---- 2. Wallets at or below their alert threshold ------------------------
  // (PostgREST cannot compare two columns, so filter balance in code.)
  const { data: wallets, error: walletsError } = await admin
    .from('wallets')
    .select('id, owner_id, name, balance, minimum_balance')
    .gt('minimum_balance', 0);

  // ---- 3. Budgets in their current period (thresholds checked below) ------
  const { data: budgetRows, error: budgetsError } = await admin
    .from('budgets')
    .select('id, owner_id, name, category_id, amount, start_date, end_date, thresholds')
    .lte('start_date', today)
    .gte('end_date', today);

  if (subsError || walletsError || budgetsError) {
    console.error('push: scheduled queries failed', subsError ?? walletsError ?? budgetsError);
    return json(500, { error: 'scheduled queries failed' });
  }

  const renewals = (subs ?? []).filter((s) => String(s.next_renewal_date) < windowEnd);
  const lowWallets = (wallets ?? []).filter(
    (w) => Number(w.balance) <= Number(w.minimum_balance),
  );
  // Only budgets with at least one alert milestone configured.
  const currentBudgets = ((budgetRows ?? []) as unknown as BudgetRow[]).filter(
    (b) => Array.isArray(b.thresholds) && b.thresholds.length > 0,
  );
  const budgetAlerts = await findBudgetAlerts(admin, currentBudgets);

  const ownerIds = [
    ...new Set(
      [...renewals, ...lowWallets, ...budgetAlerts.map((a) => a.budget)].map(
        (row) => row.owner_id,
      ),
    ),
  ];

  const [prefs, deviceMap] = await Promise.all([
    loadPrefs(admin, ownerIds),
    loadDevices(admin, ownerIds),
  ]);

  let sent = 0;
  let claimed = 0;

  for (const sub of renewals) {
    if (!categoryEnabled(prefs, sub.owner_id, 'renewals')) continue;
    const ref = `sub:${sub.id}:${sub.next_renewal_date}`;
    if (!(await claim(admin, sub.owner_id, 'renewals', ref))) continue;
    claimed++;
    const devices = deviceMap.get(sub.owner_id) ?? [];
    sent += await sendToOwner(admin, devices, sub.owner_id, {
      notification: {
        title: `Renewal soon: ${sub.name}`,
        body: `${shortDate(String(sub.next_renewal_date))} · ${fmtAmount(sub.amount)}`,
        tag: `renewals-${sub.id}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        requireInteraction: true,
        data: {
          url: '/subscriptions',
          onActionClick: {
            default: { url: '/subscriptions', operation: 'navigateLastFocusedOrOpen' },
          },
        },
      },
    });
  }

  for (const wallet of lowWallets) {
    if (!categoryEnabled(prefs, wallet.owner_id, 'low_balance')) continue;
    const ref = `wallet:${wallet.id}:${today}`;
    if (!(await claim(admin, wallet.owner_id, 'low_balance', ref))) continue;
    claimed++;
    const devices = deviceMap.get(wallet.owner_id) ?? [];
    sent += await sendToOwner(admin, devices, wallet.owner_id, {
      notification: {
        title: `Low balance: ${wallet.name}`,
        body: `${fmtAmount(wallet.balance)} left · alert at ${fmtAmount(wallet.minimum_balance)}`,
        tag: `low-balance-${wallet.id}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        requireInteraction: true,
        data: {
          url: '/wallets',
          onActionClick: {
            default: { url: '/wallets', operation: 'navigateLastFocusedOrOpen' },
          },
        },
      },
    });
  }

  // ---- 4. Budget threshold alerts ------------------------------------------
  // Claim every milestone the spending has reached (so a lower one can never
  // fire later), but send only the highest — one notification per jump.
  for (const alert of budgetAlerts) {
    const { budget, spent, crossed } = alert;
    if (!categoryEnabled(prefs, budget.owner_id, 'budget')) continue;

    const highest = crossed[crossed.length - 1];
    let highestWon = false;
    for (const pct of crossed) {
      const ref = `budget:${budget.id}:${String(budget.start_date)}:${pct}`;
      const won = await claim(admin, budget.owner_id, 'budget', ref);
      if (won) {
        claimed++;
        if (pct === highest) highestWon = true;
      }
    }
    if (!highestWon) continue;

    const over = highest >= 100;
    const devices = deviceMap.get(budget.owner_id) ?? [];
    sent += await sendToOwner(admin, devices, budget.owner_id, {
      notification: {
        title: over
          ? `Budget exceeded: ${budget.name}`
          : `Budget at ${highest}%: ${budget.name}`,
        body: over
          ? `${fmtAmount(spent)} spent of ${fmtAmount(budget.amount)} limit`
          : `${fmtAmount(spent)} of ${fmtAmount(budget.amount)} spent`,
        tag: `budget-${budget.id}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        requireInteraction: true,
        data: {
          url: '/budgets',
          onActionClick: {
            default: { url: '/budgets', operation: 'navigateLastFocusedOrOpen' },
          },
        },
      },
    });
  }

  // ---- 5. Daily expense summary (8 AM IST only) -----------------------------
  // The cron runs every 15 minutes; this block fires once per day at 8 AM.
  // De-duplication via push_notification_log (ref: daily-expense:<date>)
  // ensures a single send even if multiple cron ticks fall in the 8 AM hour.
  if (isEightAM()) {
    const yesterday = dayIso(-1);

    const { data: expenseRows, error: expenseError } = await admin
      .from('transactions')
      .select('owner_id, amount')
      .eq('direction', 'out')
      .eq('occurred_on', yesterday)
      .gt('amount', 0);

    if (expenseError) {
      console.error('push: daily expense query failed', expenseError);
    } else {
      // Group totals per user
      const perUser = new Map<string, number>();
      for (const row of expenseRows ?? []) {
        perUser.set(
          row.owner_id,
          (perUser.get(row.owner_id) ?? 0) + Number(row.amount),
        );
      }

      const ownerIds = [...perUser.keys()];
      const [prefs, deviceMap] = await Promise.all([
        loadPrefs(admin, ownerIds),
        loadDevices(admin, ownerIds),
      ]);

      const amountFmt = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      });

      for (const [ownerId, totalAmount] of perUser) {
        if (!categoryEnabled(prefs, ownerId, 'daily_expense')) continue;
        const ref = `daily-expense:${yesterday}`;
        if (!(await claim(admin, ownerId, 'daily_expense', ref))) continue;
        claimed++;

        const devices = deviceMap.get(ownerId) ?? [];
        sent += await sendToOwner(admin, devices, ownerId, {
          notification: {
            title: `Yesterday's expenses`,
            body: `You spent ${amountFmt.format(totalAmount)} yesterday`,
            tag: `daily-expense-${yesterday}`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            requireInteraction: true,
            data: {
              url: '/dashboard',
              onActionClick: {
                default: {
                  url: '/dashboard',
                  operation: 'navigateLastFocusedOrOpen',
                },
              },
            },
          },
        });
      }
    }
  }

  // Keep the de-duplication log small. Budget periods can run up to a year,
  // so claims must survive longer than the old 90-day window.
  const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString();
  await admin.from('push_notification_log').delete().lt('created_at', cutoff);

  return json(200, {
    mode: 'scheduled',
    candidates: renewals.length + lowWallets.length + budgetAlerts.length,
    claimed,
    sent,
  });
}

async function runTest(admin: SupabaseClient, userId: string): Promise<Response> {
  const devices = await loadDevices(admin, [userId]);
  const list = devices.get(userId) ?? [];
  const sent = await sendToOwner(admin, list, userId, {
    notification: {
      title: 'Test notification',
      body: 'rūpa push notifications are working on this device.',
      tag: `push-test-${Date.now()}`, // unique tag → never collapsed
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: {
        url: '/settings',
        onActionClick: {
          default: { url: '/settings', operation: 'navigateLastFocusedOrOpen' },
        },
      },
    },
  });
  return json(200, { mode: 'test', devices: list.length, sent });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  try {
    const admin = adminClient();
    const cronSecret = req.headers.get('x-cron-secret');

    // ----- mode 1: scheduler -------------------------------------------------
    if (cronSecret) {
      const { data: row } = await admin
        .from('push_config')
        .select('value')
        .eq('name', 'cron_secret')
        .maybeSingle();
      if (!row || row.value !== cronSecret) {
        return json(401, { error: 'invalid cron secret' });
      }
      return await runScheduled(admin);
    }

    // ----- mode 2: signed-in user (test notification) ------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json(401, { error: 'missing authorization' });
    }
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(401, { error: 'invalid token' });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'test') {
      return json(400, { error: 'unknown action' });
    }
    return await runTest(admin, userData.user.id);
  } catch (err) {
    console.error('push: unhandled error', err);
    return json(500, { error: 'internal error' });
  }
});
