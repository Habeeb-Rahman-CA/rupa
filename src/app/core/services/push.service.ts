import { Injectable, computed, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { errorText } from '../../shared/utils/error-utils';

export type PushCategory = 'renewals' | 'low_balance';

export type PushCategoryState = 'on' | 'off' | 'unknown';

/**
 * Web Push state for this device.
 *
 *  - `unsupported` — the browser has no Notification/Push/service-worker APIs
 *  - `dev`         — service worker disabled (dev build); push runs in prod
 *  - `denied`      — the user blocked notifications (site settings must be used)
 *  - `off`         — no subscription yet (permission may or may not be granted)
 *  - `active`      — permission granted and this device is subscribed
 */
export type PushStatus = 'unsupported' | 'dev' | 'denied' | 'off' | 'active';

/**
 * Owns everything push-related on the client:
 *  - permission is ONLY requested from `enable()` (an explicit user action),
 *  - one row in `push_subscriptions` per device, kept in sync (healed after
 *    browser-side rotation via `pushsubscriptionchange`, removed on disable),
 *  - per-category preferences (missing row = enabled),
 *  - test notifications through the push-notifications Edge Function.
 *
 * Sending, scheduling and de-duplication all happen on the backend — this
 * service never sends anything itself and there are no browser timers.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator;

  readonly permission = signal<NotificationPermission>(
    this.isSupported ? Notification.permission : 'denied',
  );
  readonly hasSubscription = signal(false);
  readonly busy = signal(false);
  /** Feedback line for the settings card (success or error, transient). */
  readonly message = signal<string | null>(null);

  readonly renewalsEnabled = signal(true);
  readonly lowBalanceEnabled = signal(true);

  readonly status = computed<PushStatus>(() => {
    if (!this.isSupported) return 'unsupported';
    if (!this.swPush.isEnabled) return 'dev';
    if (this.permission() === 'denied') return 'denied';
    if (this.permission() === 'granted' && this.hasSubscription()) return 'active';
    return 'off';
  });

  readonly renewalsState = computed<PushCategoryState>(() =>
    this.renewalsEnabled() ? 'on' : 'off',
  );
  readonly lowBalanceState = computed<PushCategoryState>(() =>
    this.lowBalanceEnabled() ? 'on' : 'off',
  );

  private initialized = false;
  private watchingRotation = false;

  // --------------------------------------------------------------- lifecycle

  /**
   * Called after sign-in (from the data sync). Loads preferences, reconciles
   * this device's subscription (heals lost rows, silently re-subscribes after
   * browser rotation when permission is already granted) and starts watching
   * for `pushsubscriptionchange`. Never requests permission here.
   */
  async init(): Promise<void> {
    if (!this.isSupported || !this.swPush.isEnabled) return;
    if (!this.auth.user()) return;

    this.watchRotation();
    await this.loadPreferences();
    await this.reconcile();
  }

  /** Clear per-user state on sign-out (keeps the browser permission alone). */
  reset(): void {
    this.hasSubscription.set(false);
    this.permission.set(
      this.isSupported ? Notification.permission : 'denied',
    );
    this.renewalsEnabled.set(true);
    this.lowBalanceEnabled.set(true);
    this.message.set(null);
  }

  /**
   * Browser rotates/invalidates the subscription (key rotation, expiry) and
   * the service worker broadcasts the change — follow it: persist the new
   * subscription, drop the old endpoint's row. If the browser could not
   * produce a replacement, `reconcile()` on the next load re-subscribes.
   */
  private watchRotation(): void {
    if (this.watchingRotation) return;
    this.watchingRotation = true;
    this.swPush.pushSubscriptionChanges.subscribe({
      next: ({ oldSubscription, newSubscription }) => {
        void this.handleRotation(oldSubscription, newSubscription);
      },
      error: () => {
        // SwPush observables error when the SW is unavailable — nothing to do.
        this.watchingRotation = false;
      },
    });
  }

  private async handleRotation(
    oldSubscription: PushSubscription | null,
    newSubscription: PushSubscription | null,
  ): Promise<void> {
    try {
      const userId = this.auth.user()?.id;
      if (!userId) return;
      if (oldSubscription?.endpoint) {
        await this.supabase.client
          .from('push_subscriptions')
          .delete()
          .eq('owner_id', userId)
          .eq('endpoint', oldSubscription.endpoint);
      }
      if (newSubscription) {
        await this.persist(userId, newSubscription);
      } else {
        this.hasSubscription.set(false);
      }
    } catch (error: unknown) {
      console.error('Failed to follow push subscription change', error);
    }
  }

  // ---------------------------------------------------------------- actions

  /**
   * Explicit user action: ask for permission, subscribe, persist the device.
   * This is the ONLY place `Notification.requestPermission()` is called.
   */
  async enable(): Promise<void> {
    if (this.busy()) return;
    if (!this.isSupported) {
      this.message.set('This browser does not support push notifications.');
      return;
    }
    if (!this.swPush.isEnabled) {
      this.message.set(
        'Push notifications run in the production build — not available while developing.',
      );
      return;
    }

    this.busy.set(true);
    this.message.set(null);
    try {
      const result = await Notification.requestPermission();
      this.permission.set(result);
      if (result !== 'granted') {
        this.message.set(
          result === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'
            : 'Permission not granted — notifications stay off.',
        );
        return;
      }
      await this.reconcile();
      this.message.set(
        this.hasSubscription()
          ? 'Notifications enabled on this device.'
          : 'Could not register this device for notifications.',
      );
    } catch (error: unknown) {
      this.message.set(errorText(error, 'Couldn’t enable notifications.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Turn push off on THIS device only: drop its row (other devices keep
   * working) and unsubscribe the browser.
   */
  async disable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const userId = this.auth.user()?.id;
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription?.endpoint && userId) {
        await this.supabase.client
          .from('push_subscriptions')
          .delete()
          .eq('owner_id', userId)
          .eq('endpoint', subscription.endpoint);
      }
      if (subscription) {
        await subscription.unsubscribe();
      }
      this.hasSubscription.set(false);
      this.message.set('Notifications turned off on this device.');
    } catch (error: unknown) {
      this.message.set(errorText(error, 'Couldn’t turn off notifications.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Send a test notification to this device via the backend. */
  async sendTest(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const { data, error } = await this.supabase.client.functions.invoke(
        'push-notifications',
        { body: { action: 'test' } },
      );
      if (error) throw error;
      const sent = Number((data as { sent?: number } | null)?.sent ?? 0);
      this.message.set(
        sent > 0
          ? `Test notification sent to ${sent} device${sent === 1 ? '' : 's'}.`
          : 'No registered devices found — turn notifications on first.',
      );
    } catch (error: unknown) {
      this.message.set(errorText(error, 'Couldn’t send the test notification.'));
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------------ preferences

  async setCategory(category: PushCategory, enabled: boolean): Promise<void> {
    const signal_ = category === 'renewals' ? this.renewalsEnabled : this.lowBalanceEnabled;
    const previous = signal_();
    signal_.set(enabled);
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      const { error } = await this.supabase.client.from('push_preferences').upsert(
        {
          owner_id: userId,
          category,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,category' },
      );
      if (error) throw error;
    } catch (error: unknown) {
      signal_.set(previous);
      this.message.set(errorText(error, 'Couldn’t save the notification setting.'));
    }
  }

  private async loadPreferences(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      const { data, error } = await this.supabase.client
        .from('push_preferences')
        .select('category, enabled')
        .eq('owner_id', userId);
      if (error) throw error;
      const rows = (data ?? []) as { category: PushCategory; enabled: boolean }[];
      // No row = category enabled (opt-out model; matches the backend).
      this.renewalsEnabled.set(rows.find((r) => r.category === 'renewals')?.enabled ?? true);
      this.lowBalanceEnabled.set(rows.find((r) => r.category === 'low_balance')?.enabled ?? true);
    } catch (error: unknown) {
      console.error('Failed to load push preferences', error);
    }
  }

  // ------------------------------------------------- subscription management

  /**
   * Ensure this device has a live subscription and the DB knows about it.
   * Called from `enable()` (after permission was just granted) and from
   * `init()` when permission is already granted (renewal — no prompt shown).
   */
  private async reconcile(): Promise<void> {
    if (this.permission() !== 'granted') return;
    try {
      const registration = await this.waitForRegistration();
      if (!registration) return;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(environment.vapidPublicKey),
        });
      }

      const userId = this.auth.user()?.id;
      if (userId) await this.persist(userId, subscription);
      this.hasSubscription.set(true);
    } catch (error: unknown) {
      console.error('Failed to register push subscription', error);
      this.hasSubscription.set(false);
    }
  }

  /**
   * Wait briefly for the service worker to register (registrationStrategy is
   * `registerWhenStable:30000`, so on a cold first load it can lag behind
   * sign-in; the timeout matches that cap).
   */
  private async waitForRegistration(): Promise<ServiceWorkerRegistration | undefined> {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 30_000)),
    ]);
  }

  /** Upsert this device's row (idempotent — heals lost/rotated rows). */
  private async persist(userId: string, subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const keys = json.keys;
    const endpoint = json.endpoint;
    const p256dh = keys?.['p256dh'];
    const auth = keys?.['auth'];
    if (!endpoint || !p256dh || !auth) {
      throw new Error('Incomplete push subscription.');
    }
    const { error } = await this.supabase.client.from('push_subscriptions').upsert(
      {
        owner_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 300),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,endpoint' },
    );
    if (error) throw error;
  }
}

/** VAPID public key (base64url) → Uint8Array for `pushManager.subscribe`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
