import { Injectable, effect, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

export type PushCategory =
  | 'renewals'
  | 'low_balance'
  | 'budget'
  | 'daily_expense'
  | 'daily_confirm';

export type PushStatus = 'off' | 'dev' | 'denied' | 'active';

interface PushSubscriptionResponse {
  id: string;
  owner_id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

interface PushPreferenceResponse {
  category: PushCategory;
  enabled: boolean;
}

interface SubscribePushRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}

interface SubscribePushResponse {
  status: string;
  subscription_id: string;
}

interface DeleteResponse {
  message: string;
}

interface PushTestResponse {
  mode: string;
  devices: number;
  sent: number;
}

interface UpdatePushPreferencesRequest {
  preferences: Array<{ category: PushCategory; enabled: boolean }>;
}

/** Browser-native PushSubscription - minimal interface for type safety. */
interface BrowserPushSubscription {
  endpoint: string;
  getKey: (name: string) => Uint8Array | null;
  unsubscribe: () => Promise<boolean>;
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _subscriptions = signal<PushSubscriptionResponse[]>([]);
  private readonly _preferences = signal<PushPreferenceResponse[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _isSupported = signal(false);
  private readonly _busy = signal(false);
  private readonly _status = signal<PushStatus>('off');
  private readonly _message = signal<string | null>(null);

  readonly subscriptions = this._subscriptions.asReadonly();
  readonly preferences = this._preferences.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isSupported = this._isSupported.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly status = this._status.asReadonly();
  readonly message = this._message.asReadonly();

  readonly renewalsEnabled = computed(() => this.isCategoryEnabled('renewals'));
  readonly lowBalanceEnabled = computed(() => this.isCategoryEnabled('low_balance'));
  readonly budgetEnabled = computed(() => this.isCategoryEnabled('budget'));
  readonly dailyExpenseEnabled = computed(() => this.isCategoryEnabled('daily_expense'));
  readonly dailyConfirmEnabled = computed(() => this.isCategoryEnabled('daily_confirm'));

  constructor() {
    this._isSupported.set(
      typeof window !== 'undefined' && 'PushManager' in window,
    );

    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.init();
      } else {
        this._subscriptions.set([]);
        this._preferences.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const [subs, prefs] = await Promise.all([
          firstValueFrom(this.api.get<PushSubscriptionResponse[]>('/push/subscriptions')),
          firstValueFrom(this.api.get<PushPreferenceResponse[]>('/push/preferences')),
        ]);
        this._subscriptions.set(subs);
        this._preferences.set(prefs);
      } catch (err) {
        console.error('Failed to load push state', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  isCategoryEnabled(category: PushCategory): boolean {
    return this._preferences().find((p) => p.category === category)?.enabled ?? true;
  }

  async setCategory(category: PushCategory, enabled: boolean): Promise<void> {
    try {
      await firstValueFrom(
        this.api.patch('/push/preferences', {
          preferences: [{ category, enabled }],
        } as UpdatePushPreferencesRequest),
      );
      this._preferences.update((list) =>
        list.map((p) => (p.category === category ? { ...p, enabled } : p)),
      );
    } catch (error) {
      console.error('Failed to update push preference', error);
      throw error;
    }
  }

  async enable(): Promise<void> {
    if (!('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await this.registerSubscription(existing);
      return;
    }

    const vapidPublicKey = environment.vapidPublicKey;
    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured — push notifications unavailable.');
      return;
    }

    const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });

    await this.registerSubscription(subscription);
  }

  async disable(): Promise<void> {
    if (!('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const subId = this._subscriptions().find((s) => s.endpoint === existing.endpoint)?.id;
      if (subId) {
        try {
          await firstValueFrom(this.api.delete<DeleteResponse>(`/push/subscribe/${subId}`));
        } catch {
          // Ignore API errors — still unsubscribe at browser level
        }
      }
      await existing.unsubscribe();
    }

    this._subscriptions.set([]);
  }

  async sendTest(): Promise<void> {
    try {
      await firstValueFrom(this.api.post<PushTestResponse>('/push/test', {}));
    } catch (error) {
      console.error('Failed to send test push notification', error);
      throw error;
    }
  }

  private async registerSubscription(sub: any): Promise<void> {
    const key = sub.getKey('p256dh');
    const auth = sub.getKey('auth');

    const p256dh = key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '';
    const authStr = auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '';

    try {
      const result = await firstValueFrom(
        this.api.post<SubscribePushResponse>('/push/subscribe', {
          endpoint: sub.endpoint,
          p256dh,
          auth: authStr,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        } as SubscribePushRequest),
      );
      this._subscriptions.update((list) => [...list, {
        id: result.subscription_id,
        endpoint: sub.endpoint,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as PushSubscriptionResponse]);
    } catch (error) {
      console.error('Failed to register push subscription with API', error);
      throw error;
    }
  }
}
