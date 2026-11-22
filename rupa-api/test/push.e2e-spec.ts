import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import * as webPush from 'web-push';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { PushSubscription } from '../src/push/entities/push-subscription.entity.js';
import { PushPreference } from '../src/push/entities/push-preference.entity.js';
import { PushNotificationLog } from '../src/push/entities/push-notification-log.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { PushController } from '../src/push/push.controller.js';
import { PushService } from '../src/push/push.service.js';
import { DataSource, Repository } from 'typeorm';
import supertest from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

const TEST_DB_URL = 'postgresql://postgres@localhost:5433/rupa';

const mockConfigService = {
  get: (key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      'jwt.accessSecret': 'change-me-access-secret-min-32-chars',
      'jwt.accessExpiration': '15m',
      'jwt.refreshSecret': 'change-me-refresh-secret-min-32-chars',
      'jwt.refreshExpiration': '7d',
      'app.nodeEnv': 'development',
      'app.port': 3000,
      'app.apiPrefix': '/api',
      'app.corsOrigin': 'http://localhost:4200',
      'app.cookieSecure': false,
      'app.cookieSameSite': 'lax',
      'app.cookieDomain': '',
      'push.vapidPublicKey': 'test-public-key',
      'push.vapidPrivateKey': 'test-private-key',
      'push.vapidSubject': 'https://localhost:3000',
      'push.timeZone': 'Asia/Kolkata',
      'push.renewalWindowDays': 3,
      'push.cronSecret': 'test-cron-secret',
    };
    return config[key] ?? defaultValue ?? null;
  },
  getString: (key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      'jwt.accessSecret': 'change-me-access-secret-min-32-chars',
      'jwt.accessExpiration': '15m',
      'jwt.refreshSecret': 'change-me-refresh-secret-min-32-chars',
      'jwt.refreshExpiration': '7d',
      'app.nodeEnv': 'development',
      'app.port': '3000',
      'app.apiPrefix': '/api',
      'app.corsOrigin': 'http://localhost:4200',
      'app.cookieSecure': 'false',
      'app.cookieSameSite': 'lax',
      'app.cookieDomain': '',
      'push.vapidPublicKey': 'test-public-key',
      'push.vapidPrivateKey': 'test-private-key',
      'push.vapidSubject': 'https://localhost:3000',
      'push.timeZone': 'Asia/Kolkata',
      'push.renewalWindowDays': '3',
      'push.cronSecret': 'test-cron-secret',
    };
    return config[key] ?? defaultValue ?? null;
  },
  getNumber: (key: string, defaultValue?: number) => {
    const config: Record<string, number> = { 'app.port': 3000 };
    return config[key] ?? defaultValue ?? 0;
  },
  getBoolean: (key: string, defaultValue?: boolean) => {
    const config: Record<string, boolean> = { 'app.cookieSecure': false };
    return config[key] ?? defaultValue ?? false;
  },
} as unknown as ConfigService;

describe('PushController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let subRepository: Repository<PushSubscription>;
  let userRepository: Repository<User>;
  let request: ReturnType<typeof supertest>;

  let pgAdmin: DataSource;

  beforeAll(async () => {
    pgAdmin = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      synchronize: false,
      logging: false,
    });
    await pgAdmin.initialize();
    await pgAdmin.query('DROP TABLE IF EXISTS "push_notification_log" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "push_preferences" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "push_subscriptions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "refresh_tokens" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "users" CASCADE');
    await pgAdmin.destroy();
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: TEST_DB_URL,
          entities: [User, RefreshToken, PushSubscription, PushPreference, PushNotificationLog],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, PushSubscription, PushPreference, PushNotificationLog]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
        ScheduleModule.forRoot(),
      ],
      providers: [
        AuthService,
        PushService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, PushController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    subRepository = dataSource.getRepository(PushSubscription);
    userRepository = dataSource.getRepository(User);
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "push_notification_log", "push_preferences", "push_subscriptions", "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  function normalizeSetCookie(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function cookieHeader(setCookie: string | string[] | undefined): string {
    return normalizeSetCookie(setCookie)
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
  }

  async function registerAndCapture(email = 'pushuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  describe('POST /push/subscribe', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should subscribe a device and return the subscription id', async () => {
      const res = await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'BASE64P256DHKEY',
          auth: 'BASE64AUTHKEY',
          user_agent: 'Chrome/120.0',
        })
        .expect(201);

      expect(res.body.status).toBe('subscribed');
      expect(res.body.subscription_id).toBeDefined();
    });

    it('should require authentication', async () => {
      await request
        .post('/push/subscribe')
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'BASE64P256DHKEY',
          auth: 'BASE64AUTHKEY',
        })
        .expect(401);
    });

    it('should reject invalid payload', async () => {
      await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({ endpoint: 'not-a-url' })
        .expect(400);
    });

    it('should update existing subscription on re-subscribe with same endpoint', async () => {
      await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'OLD-KEY',
          auth: 'OLD-AUTH',
        })
        .expect(201);

      const res = await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'NEW-KEY',
          auth: 'NEW-AUTH',
          user_agent: 'Firefox/120',
        })
        .expect(201);

      expect(res.body.subscription_id).toBeDefined();
    });
  });

  describe('DELETE /push/subscribe/:id', () => {
    let subscriptionId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'BASE64P256DHKEY',
          auth: 'BASE64AUTHKEY',
        })
        .expect(201);
      subscriptionId = res.body.subscription_id;
    });

    it('should delete an owned subscription', async () => {
      await request
        .delete(`/push/subscribe/${subscriptionId}`)
        .set('Cookie', cookies)
        .expect(200);

      const remaining = await subRepository.findOne({ where: { id: subscriptionId } });
      expect(remaining).toBeNull();
    });

    it('should reject deleting another user subscription', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .delete(`/push/subscribe/${subscriptionId}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);

      const stillThere = await subRepository.findOne({ where: { id: subscriptionId } });
      expect(stillThere).not.toBeNull();
    });

    it('should reject deleting a non-existent subscription', async () => {
      await request
        .delete('/push/subscribe/00000000-0000-0000-0000-000000000000')
        .set('Cookie', cookies)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request
        .delete(`/push/subscribe/${subscriptionId}`)
        .expect(401);
    });
  });

  describe('GET /push/subscriptions', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should list only owned subscriptions', async () => {
      await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'KEY1',
          auth: 'AUTH1',
        })
        .expect(201);

      const res = await request
        .get('/push/subscriptions')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/device-1');
    });

    it('should require authentication', async () => {
      await request.get('/push/subscriptions').expect(401);
    });
  });

  describe('GET /push/preferences', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should return default preferences (all enabled)', async () => {
      const res = await request
        .get('/push/preferences')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(5);
      expect(res.body.every((p: any) => p.enabled === true)).toBe(true);
    });

    it('should require authentication', async () => {
      await request.get('/push/preferences').expect(401);
    });
  });

  describe('PATCH /push/preferences', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should update preferences', async () => {
      const res = await request
        .patch('/push/preferences')
        .set('Cookie', cookies)
        .send({
          preferences: [
            { category: 'renewals', enabled: false },
            { category: 'low_balance', enabled: false },
          ],
        })
        .expect(200);

      expect(res.body.message).toContain('updated');

      const getRes = await request
        .get('/push/preferences')
        .set('Cookie', cookies)
        .expect(200);

      const renewals = getRes.body.find((p: any) => p.category === 'renewals');
      expect(renewals.enabled).toBe(false);
    });

    it('should require authentication', async () => {
      await request
        .patch('/push/preferences')
        .send({ preferences: [] })
        .expect(401);
    });
  });

  describe('POST /push/test', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should send test notification to owned devices', async () => {
      await request
        .post('/push/subscribe')
        .set('Cookie', cookies)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: 'BASE64P256DHKEY',
          auth: 'BASE64AUTHKEY',
        })
        .expect(201);

      const res = await request
        .post('/push/test')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.mode).toBe('test');
      expect(res.body.devices).toBe(1);
    });

    it('should require authentication', async () => {
      await request.post('/push/test').expect(401);
    });
  });

  describe('POST /push/scheduled', () => {
    it('should require valid cron secret', async () => {
      await request
        .post('/push/scheduled')
        .set('x-cron-secret', 'wrong-secret')
        .expect(401);
    });

    it('should reject missing cron secret', async () => {
      await request
        .post('/push/scheduled')
        .expect(401);
    });

    it('should run scheduled checks with valid cron secret', async () => {
      await request
        .post('/push/scheduled')
        .set('x-cron-secret', 'test-cron-secret')
        .expect(200);
    });

    it('should not accept JWT authentication for scheduled endpoint', async () => {
      const { setCookie } = await registerAndCapture();
      await request
        .post('/push/scheduled')
        .set('Cookie', cookieHeader(setCookie))
        .expect(401);
    });
  });
});
