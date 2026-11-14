import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SwPush } from '@angular/service-worker';

import { AuthService } from './auth.service';
import { PushService } from './push.service';
import { SupabaseService } from './supabase.service';

interface QueryCall {
  table: string;
  op: string;
  args: unknown[];
}

describe('PushService', () => {
  let service: PushService;
  let mockSupabase: any;
  let swPushMock: { isEnabled: boolean; pushSubscriptionChanges: Subject<unknown> };

  /** Every builder operation, in order — lets tests assert table + payload. */
  let queryCalls: QueryCall[];
  /** Per-table value the awaited builder resolves with. */
  let tableResults: Record<string, { data?: unknown; error?: unknown }>;

  function makeQuery(table: string) {
    const q: any = {};
    const resolve = () =>
      Promise.resolve(tableResults[table] ?? { data: null, error: null });
    const ops = [
      'select', 'eq', 'in', 'insert', 'upsert', 'delete',
      'update', 'lt', 'gt', 'gte', 'maybeSingle', 'single',
    ];
    for (const op of ops) {
      q[op] = (...args: unknown[]) => {
        queryCalls.push({ table, op, args });
        return q;
      };
    }
    q.then = (onFulfilled: any, onRejected: any) =>
      resolve().then(onFulfilled, onRejected);
    return q;
  }

  const fakeSubscription = {
    endpoint: 'https://push.example.com/abc',
    toJSON: () => ({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }),
    unsubscribe: () => Promise.resolve(true),
  };

  beforeEach(() => {
    queryCalls = [];
    tableResults = {};
    mockSupabase = {
      client: {
        from: jasmine.createSpy('from').and.callFake((table: string) =>
          makeQuery(table),
        ),
        functions: { invoke: jasmine.createSpy('invoke') },
      },
    };
    swPushMock = {
      isEnabled: true,
      pushSubscriptionChanges: new Subject(),
    };

    TestBed.configureTestingModule({
      providers: [
        PushService,
        {
          provide: AuthService,
          useValue: { user: signal({ id: 'u1' }) },
        },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: SwPush, useValue: swPushMock },
      ],
    });

    service = TestBed.inject(PushService);
  });

  // ------------------------------------------------------------------- status

  it('starts with both categories enabled (opt-out model)', () => {
    expect(service.renewalsEnabled()).toBeTrue();
    expect(service.lowBalanceEnabled()).toBeTrue();
    expect(service.renewalsState()).toBe('on');
    expect(service.lowBalanceState()).toBe('on');
  });

  it('reports "off" when permission has not been granted', () => {
    service.permission.set('default');
    service.hasSubscription.set(false);
    expect(service.status()).toBe('off');
  });

  it('reports "denied" even when a stale subscription exists', () => {
    service.permission.set('denied');
    service.hasSubscription.set(true);
    expect(service.status()).toBe('denied');
  });

  it('reports "active" only with granted permission and a subscription', () => {
    service.permission.set('granted');
    service.hasSubscription.set(false);
    expect(service.status()).toBe('off');

    service.hasSubscription.set(true);
    expect(service.status()).toBe('active');
  });

  it('reports "dev" when the service worker is disabled', () => {
    swPushMock.isEnabled = false;
    service.permission.set('granted');
    service.hasSubscription.set(true);
    expect(service.status()).toBe('dev');
  });

  // ------------------------------------------------------------------ enable

  it('enable() records a subscription when permission is granted', async () => {
    const registration = {
      pushManager: {
        getSubscription: () => Promise.resolve(fakeSubscription),
        subscribe: () => Promise.resolve(fakeSubscription),
      },
    };
    spyOn(Notification, 'requestPermission').and.returnValue(
      Promise.resolve('granted'),
    );
    spyOn(navigator.serviceWorker, 'getRegistration').and.returnValue(
      Promise.resolve(registration as any),
    );

    service.permission.set('default');
    await service.enable();

    expect(service.permission()).toBe('granted');
    expect(service.hasSubscription()).toBeTrue();
    expect(service.status()).toBe('active');

    const persist = queryCalls.find(
      (c) => c.table === 'push_subscriptions' && c.op === 'upsert',
    );
    expect(persist).toBeDefined();
    const [row, options] = persist!.args as [Record<string, unknown>, any];
    expect(row['owner_id']).toBe('u1');
    expect(row['endpoint']).toBe('https://push.example.com/abc');
    expect(row['p256dh']).toBe('p256dh-key');
    expect(row['auth']).toBe('auth-key');
    expect(options.onConflict).toBe('owner_id,endpoint');
  });

  it('enable() does not subscribe when permission is denied', async () => {
    spyOn(Notification, 'requestPermission').and.returnValue(
      Promise.resolve('denied'),
    );

    service.permission.set('default');
    await service.enable();

    expect(service.permission()).toBe('denied');
    expect(service.hasSubscription()).toBeFalse();
    expect(service.status()).toBe('denied');
    expect(queryCalls).toEqual([]); // nothing was written
    expect(service.message()).toContain('blocked');
  });

  // --------------------------------------------------------------- sendTest

  it('sendTest() reports how many devices received the notification', async () => {
    mockSupabase.client.functions.invoke.and.returnValue(
      Promise.resolve({ data: { mode: 'test', devices: 1, sent: 1 }, error: null }),
    );

    await service.sendTest();

    expect(mockSupabase.client.functions.invoke).toHaveBeenCalledWith(
      'push-notifications',
      { body: { action: 'test' } },
    );
    expect(service.message()).toBe('Test notification sent to 1 device.');
  });

  it('sendTest() explains when no devices are registered', async () => {
    mockSupabase.client.functions.invoke.and.returnValue(
      Promise.resolve({ data: { mode: 'test', devices: 0, sent: 0 }, error: null }),
    );

    await service.sendTest();

    expect(service.message()).toBe(
      'No registered devices found — turn notifications on first.',
    );
  });

  it('sendTest() surfaces backend errors', async () => {
    mockSupabase.client.functions.invoke.and.returnValue(
      Promise.resolve({ data: null, error: { message: 'Edge Function deploy required' } }),
    );

    await service.sendTest();

    expect(service.message()).toBe('Edge Function deploy required');
  });

  // ------------------------------------------------------------- preferences

  it('setCategory() updates the signal and upserts the preference row', async () => {
    await service.setCategory('renewals', false);

    expect(service.renewalsEnabled()).toBeFalse();
    expect(service.renewalsState()).toBe('off');

    const upsert = queryCalls.find(
      (c) => c.table === 'push_preferences' && c.op === 'upsert',
    );
    expect(upsert).toBeDefined();
    const [row, options] = upsert!.args as [Record<string, unknown>, any];
    expect(row['owner_id']).toBe('u1');
    expect(row['category']).toBe('renewals');
    expect(row['enabled']).toBeFalse();
    expect(options.onConflict).toBe('owner_id,category');
  });

  it('setCategory() rolls back the toggle when the save fails', async () => {
    tableResults['push_preferences'] = {
      data: null,
      error: { message: 'row-level security denied' },
    };

    await service.setCategory('low_balance', false);

    expect(service.lowBalanceEnabled()).toBeTrue(); // reverted
    expect(service.message()).toBe('row-level security denied');
  });

  it('init() loads stored preferences (missing rows stay enabled)', async () => {
    tableResults['push_preferences'] = {
      data: [{ category: 'renewals', enabled: false }],
      error: null,
    };
    // Not granted → reconcile() stops before touching the service worker.
    service.permission.set('default');

    await service.init();

    expect(service.renewalsEnabled()).toBeFalse(); // stored opt-out applied
    expect(service.lowBalanceEnabled()).toBeTrue(); // no row → enabled
  });

  // ------------------------------------------------------------------ reset

  it('reset() clears per-user push state', () => {
    service.permission.set('granted');
    service.hasSubscription.set(true);
    service.renewalsEnabled.set(false);
    service.message.set('leftover');

    service.reset();

    expect(service.hasSubscription()).toBeFalse();
    expect(service.renewalsEnabled()).toBeTrue();
    expect(service.lowBalanceEnabled()).toBeTrue();
    expect(service.message()).toBeNull();
  });
});
