import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PushService } from '../src/push/push.service.js';
import { PushSubscription } from '../src/push/entities/push-subscription.entity.js';
import { PushPreference } from '../src/push/entities/push-preference.entity.js';
import { PushNotificationLog } from '../src/push/entities/push-notification-log.entity.js';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('PushService (unit)', () => {
  let service: PushService;
  let subRepo: any;
  let prefRepo: any;
  let logRepo: any;
  let dataSource: any;
  let configService: any;

  const ownerId = 'owner-1111-1111-1111-111111111111';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(webPush.sendNotification).mockReset();
    vi.mocked(webPush.setVapidDetails).mockReset();

    subRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };
    prefRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    };
    logRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    };
    dataSource = {
      query: vi.fn(),
      transaction: vi.fn(async (cb: any) => {
        const manager = {
          findOne: vi.fn(),
          find: vi.fn(),
          create: vi.fn(),
          save: vi.fn(),
          remove: vi.fn(),
          query: vi.fn(),
          upsert: vi.fn(),
        };
        return cb(manager);
      }),
    };
    configService = {
      get: vi.fn((key: string, def?: any) => {
        const c: Record<string, any> = {
          'push.vapidPublicKey': 'test-public-key',
          'push.vapidPrivateKey': 'test-private-key',
          'push.vapidSubject': 'https://localhost:3000',
          'push.timeZone': 'Asia/Kolkata',
          'push.renewalWindowDays': 3,
          'push.cronSecret': 'test-cron-secret',
        };
        return c[key] ?? def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: 'PushSubscriptionRepository', useValue: subRepo },
        { provide: 'PushPreferenceRepository', useValue: prefRepo },
        { provide: 'PushNotificationLogRepository', useValue: logRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(PushService);
    (service as any).subscriptionRepository = subRepo;
    (service as any).preferenceRepository = prefRepo;
    (service as any).logRepository = logRepo;
    (service as any).dataSource = dataSource;
    (service as any).configService = configService;
  });

  describe('subscribe', () => {
    it('creates a new push subscription', async () => {
      subRepo.findOne.mockResolvedValue(null);
      const created = { id: 'sub-1', owner_id: ownerId, endpoint: 'https://example.com/endpoint' };
      subRepo.create.mockReturnValue(created);
      subRepo.save.mockResolvedValue(created);

      const result = await service.subscribe(ownerId, {
        endpoint: 'https://example.com/endpoint',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      });

      expect(subRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://example.com/endpoint', owner_id: ownerId }),
      );
      expect(result.id).toBe('sub-1');
    });

    it('updates an existing subscription with same endpoint', async () => {
      const existing = { id: 'sub-1', owner_id: ownerId, endpoint: 'https://example.com/endpoint', p256dh: 'old', auth: 'old', user_agent: null };
      subRepo.findOne.mockResolvedValue(existing);
      subRepo.save.mockResolvedValue(existing);

      const result = await service.subscribe(ownerId, {
        endpoint: 'https://example.com/endpoint',
        p256dh: 'new-p256dh',
        auth: 'new-auth',
        user_agent: 'Chrome/120',
      });

      expect(subRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ p256dh: 'new-p256dh', auth: 'new-auth', user_agent: 'Chrome/120' }),
      );
      expect(result.id).toBe('sub-1');
    });
  });

  describe('unsubscribe', () => {
    it('deletes an owned subscription', async () => {
      subRepo.findOne.mockResolvedValue({ id: 'sub-1', owner_id: ownerId });
      subRepo.remove.mockResolvedValue(undefined);

      await service.unsubscribe(ownerId, 'sub-1');
      expect(subRepo.remove).toHaveBeenCalled();
    });

    it('throws NotFound for non-owned subscription', async () => {
      subRepo.findOne.mockResolvedValue(null);
      await expect(service.unsubscribe(ownerId, 'sub-999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPreferences', () => {
    it('returns default enabled for all categories when no prefs exist', async () => {
      prefRepo.find.mockResolvedValue([]);
      const result = await service.getPreferences(ownerId);
      expect(result).toHaveLength(5);
      expect(result.every((p) => p.enabled === true)).toBe(true);
      expect(result.map((p) => p.category).sort()).toEqual([
        'budget', 'daily_confirm', 'daily_expense', 'low_balance', 'renewals',
      ]);
    });

    it('returns stored preferences', async () => {
      prefRepo.find.mockResolvedValue([
        { owner_id: ownerId, category: 'renewals', enabled: false },
      ]);
      const result = await service.getPreferences(ownerId);
      const renewals = result.find((p) => p.category === 'renewals');
      expect(renewals?.enabled).toBe(false);
    });
  });

  describe('updatePreferences', () => {
    it('upserts preferences in a transaction', async () => {
      const manager = { upsert: vi.fn() };
      (dataSource.transaction as any).mockImplementation(async (cb: any) => cb(manager));

      await service.updatePreferences(ownerId, [
        { category: 'renewals', enabled: false },
        { category: 'budget', enabled: true },
      ]);

      expect(manager.upsert).toHaveBeenCalledTimes(2);
      expect(manager.upsert).toHaveBeenCalledWith(
        PushPreference,
        expect.objectContaining({ owner_id: ownerId, category: 'renewals', enabled: false }),
        ['owner_id', 'category'],
      );
    });
  });

  describe('sendTest', () => {
    it('sends test notification to owned devices', async () => {
      subRepo.find.mockResolvedValue([
        { id: 'sub-1', owner_id: ownerId, endpoint: 'https://example.com/endpoint', p256dh: 'p256dh', auth: 'auth' },
      ]);
      vi.spyOn(service as any, 'sendToOwner').mockResolvedValue(1);

      const result = await service.sendTest(ownerId);
      expect(result.mode).toBe('test');
      expect(result.devices).toBe(1);
      expect(result.sent).toBe(1);
    });
  });

  describe('claim (deduplication)', () => {
    it('returns true for new claim, false for duplicate', async () => {
      logRepo.findOne.mockResolvedValue(null);
      logRepo.save.mockResolvedValue({});

      const first = await (service as any).claim(ownerId, 'renewals', 'sub:sub-1:2026-11-20');
      expect(first).toBe(true);

      logRepo.findOne.mockResolvedValue({ id: 'log-1' });
      const second = await (service as any).claim(ownerId, 'renewals', 'sub:sub-1:2026-11-20');
      expect(second).toBe(false);
    });
  });

  describe('sendToOwner removes dead subscriptions', () => {
    it('deletes subscription on 410 (gone)', async () => {
      vi.mocked(webPush.sendNotification).mockRejectedValue({ statusCode: 410 });
      subRepo.delete.mockResolvedValue(undefined);

      const devices = [{ id: 'sub-1', endpoint: 'https://example.com/endpoint', p256dh: 'p256dh', auth: 'auth' }];
      const sent = await (service as any).sendToOwner(devices, ownerId, {
        notification: { title: 't', body: 'b', tag: 'tag', data: { url: '/', onActionClick: {} } },
      });

      expect(sent).toBe(0);
      expect(subRepo.delete).toHaveBeenCalledWith('sub-1');
    });

    it('keeps subscription on other errors', async () => {
      vi.mocked(webPush.sendNotification).mockRejectedValue(new Error('network'));
      subRepo.delete.mockResolvedValue(undefined);

      const devices = [{ id: 'sub-1', endpoint: 'https://example.com/endpoint', p256dh: 'p256dh', auth: 'auth' }];
      const sent = await (service as any).sendToOwner(devices, ownerId, {
        notification: { title: 't', body: 'b', tag: 'tag', data: { url: '/', onActionClick: {} } },
      });

      expect(sent).toBe(0);
      expect(subRepo.delete).not.toHaveBeenCalled();
    });
  });
});
