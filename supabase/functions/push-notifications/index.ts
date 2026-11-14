// =============================================================================
// Edge Function: push-notifications
//
// The single sending backend for Web Push. VAPID signing happens here; the
// private key exists only as a function secret (never in the app or repo).
//
// Two modes:
//   1. Scheduled (pg_cron + pg_net): header `x-cron-secret` must match the
//      random secret seeded into push_config by migration 0017. Runs the
//      renewal + low-balance checks and pushes to every subscribed device.
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
type Category = 'renewals' | 'low_balance';

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

  if (subsError || walletsError) {
    console.error('push: scheduled queries failed', subsError ?? walletsError);
    return json(500, { error: 'scheduled queries failed' });
  }

  const renewals = (subs ?? []).filter((s) => String(s.next_renewal_date) < windowEnd);
  const lowWallets = (wallets ?? []).filter(
    (w) => Number(w.balance) <= Number(w.minimum_balance),
  );

  const ownerIds = [
    ...new Set([...renewals, ...lowWallets].map((row) => row.owner_id)),
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

  // Keep the de-duplication log small.
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  await admin.from('push_notification_log').delete().lt('created_at', cutoff);

  return json(200, { mode: 'scheduled', candidates: renewals.length + lowWallets.length, claimed, sent });
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
