import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { AppSetting } from '../src/app-settings/app-settings.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { AppSettingsController } from '../src/app-settings/app-settings.controller.js';
import { AppSettingsService } from '../src/app-settings/app-settings.service.js';
import { DataSource } from 'typeorm';
import supertest from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const TEST_DB_URL = 'postgresql://postgres@localhost:5433/rupa';

const mockConfigService = {
  get: (key: string, defaultValue?: unknown) => {
    const c: Record<string, unknown> = {
      'jwt.accessSecret': 'change-me-access-secret-min-32-chars',
      'jwt.accessExpiration': '15m',
      'jwt.refreshSecret': 'change-me-refresh-secret-min-32-chars',
      'jwt.refreshExpiration': '7d',
      'app.nodeEnv': 'development',
      'app.cookieSecure': false,
      'app.cookieSameSite': 'lax',
    };
    return c[key] ?? defaultValue ?? null;
  },
  getString: (key: string, defaultValue?: string) => {
    const c: Record<string, string> = {
      'jwt.accessSecret': 'change-me-access-secret-min-32-chars',
      'jwt.accessExpiration': '15m',
      'jwt.refreshSecret': 'change-me-refresh-secret-min-32-chars',
      'jwt.refreshExpiration': '7d',
      'app.nodeEnv': 'development',
      'app.cookieSecure': 'false',
      'app.cookieSameSite': 'lax',
    };
    return c[key] ?? defaultValue ?? null;
  },
  getNumber: () => 0,
  getBoolean: () => false,
} as unknown as ConfigService;

describe('AppSettingsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "app_settings" CASCADE');
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
          entities: [User, RefreshToken, AppSetting],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, AppSetting]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        AppSettingsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, AppSettingsController],
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
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "app_settings", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'settingsuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  describe('GET /app-settings', () => {
    it('returns an all-null shape before anything is saved', async () => {
      const { setCookie } = await registerAndCapture();
      const res = await request
        .get('/app-settings')
        .set('Cookie', cookieHeader(setCookie))
        .expect(200);

      expect(res.body).toEqual({
        id: null,
        owner_id: null,
        ai_api_key: null,
        ai_base_url: null,
        ai_model: null,
        ai_headers: null,
        updated_at: null,
      });
    });

    it('returns the stored settings row', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({
          ai_api_key: 'enc:v1:iv:ct',
          ai_base_url: 'https://api.openai.com/v1',
          ai_model: 'gpt-5',
          ai_headers: { 'X-Team': 'beta' },
        })
        .expect(200);

      const res = await request.get('/app-settings').set('Cookie', cookies).expect(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.owner_id).toBeDefined();
      expect(res.body.ai_api_key).toBe('enc:v1:iv:ct');
      expect(res.body.ai_base_url).toBe('https://api.openai.com/v1');
      expect(res.body.ai_model).toBe('gpt-5');
      expect(res.body.ai_headers).toEqual({ 'X-Team': 'beta' });
      expect(res.body.updated_at).toBeDefined();
    });

    it('rejects unauthenticated requests', async () => {
      await request.get('/app-settings').expect(401);
    });
  });

  describe('PATCH /app-settings', () => {
    it('creates the row on first write (upsert)', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_api_key: 'enc:v1:first' })
        .expect(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.ai_api_key).toBe('enc:v1:first');
      expect(res.body.ai_base_url).toBeNull();

      const rows = await dataSource.query('SELECT * FROM app_settings');
      expect(rows).toHaveLength(1);
    });

    it('is idempotent: repeated PATCHes never create a second row', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request.patch('/app-settings').set('Cookie', cookies).send({ ai_api_key: 'k1' }).expect(200);
      await request.patch('/app-settings').set('Cookie', cookies).send({ ai_model: 'm1' }).expect(200);
      await request.patch('/app-settings').set('Cookie', cookies).send({ ai_model: 'm2' }).expect(200);

      const rows = await dataSource.query('SELECT * FROM app_settings');
      expect(rows).toHaveLength(1);
      // Partial updates accumulate: earlier ai_api_key is preserved.
      expect(rows[0].ai_api_key).toBe('k1');
      expect(rows[0].ai_model).toBe('m2');
    });

    it('only overwrites the fields present in the body', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({
          ai_api_key: 'enc:v1:keepme',
          ai_base_url: 'https://api.example.com/v1',
          ai_model: 'gpt-5',
          ai_headers: { A: '1' },
        })
        .expect(200);

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_model: 'gemini-3.8-flash' })
        .expect(200);

      expect(res.body.ai_model).toBe('gemini-3.8-flash');
      expect(res.body.ai_api_key).toBe('enc:v1:keepme');
      expect(res.body.ai_base_url).toBe('https://api.example.com/v1');
      expect(res.body.ai_headers).toEqual({ A: '1' });
    });

    it('clears a column when an explicit null is sent', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_api_key: 'enc:v1:x', ai_model: 'gpt-5' })
        .expect(200);

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_api_key: null })
        .expect(200);

      expect(res.body.ai_api_key).toBeNull();
      expect(res.body.ai_model).toBe('gpt-5');
    });

    it('never accepts a client-supplied owner_id (400 unknown field)', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ owner_id: '33333333-3333-4333-8333-333333333333' })
        .expect(400);

      const rows = await dataSource.query('SELECT * FROM app_settings');
      expect(rows).toHaveLength(0);
    });

    it('rejects non-string header values with 400', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_headers: { 'X-A': 42 } })
        .expect(400);
    });

    it('rejects an array for ai_headers with 400', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_headers: ['X-A: 1'] })
        .expect(400);
    });

    it('rejects an oversized ai_api_key with 400', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_api_key: 'x'.repeat(9000) })
        .expect(400);
    });

    it('trims surrounding whitespace from string fields', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_base_url: '  https://api.openai.com/v1  ', ai_model: '  gpt-5 ' })
        .expect(200);

      expect(res.body.ai_base_url).toBe('https://api.openai.com/v1');
      expect(res.body.ai_model).toBe('gpt-5');
    });

    it('turns an empty-string field into null', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_model: 'gpt-5' })
        .expect(200);

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_model: '   ' })
        .expect(200);
      expect(res.body.ai_model).toBeNull();
    });

    it('rejects unauthenticated requests', async () => {
      await request.patch('/app-settings').send({ ai_model: 'x' }).expect(401);
    });
  });

  describe('cross-user isolation', () => {
    it('scopes reads and writes to each authenticated user', async () => {
      const { setCookie: aCookie } = await registerAndCapture('iso-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('iso-b@example.com');
      const cookiesA = cookieHeader(aCookie);
      const cookiesB = cookieHeader(bCookie);

      await request
        .patch('/app-settings')
        .set('Cookie', cookiesA)
        .send({ ai_api_key: 'enc:v1:secret-a', ai_model: 'model-a' })
        .expect(200);

      // B sees nothing of A's row.
      const resB = await request.get('/app-settings').set('Cookie', cookiesB).expect(200);
      expect(resB.body.ai_api_key).toBeNull();
      expect(resB.body.ai_model).toBeNull();

      // B's write creates B's own row, not a mutation of A's.
      await request
        .patch('/app-settings')
        .set('Cookie', cookiesB)
        .send({ ai_model: 'model-b' })
        .expect(200);

      const resA = await request.get('/app-settings').set('Cookie', cookiesA).expect(200);
      expect(resA.body.ai_api_key).toBe('enc:v1:secret-a');
      expect(resA.body.ai_model).toBe('model-a');

      const rows = await dataSource.query('SELECT * FROM app_settings ORDER BY owner_id');
      expect(rows).toHaveLength(2);
      expect(rows[0].owner_id).not.toBe(rows[1].owner_id);
    });

    it('stores the key exactly as sent (opaque ciphertext, no server-side transform)', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const cipher = 'enc:v1:aXZiZWxpeA==:Y2lwaGVydGV4dA==';

      const res = await request
        .patch('/app-settings')
        .set('Cookie', cookies)
        .send({ ai_api_key: cipher })
        .expect(200);
      expect(res.body.ai_api_key).toBe(cipher);

      const rows = await dataSource.query('SELECT ai_api_key FROM app_settings');
      expect(rows[0].ai_api_key).toBe(cipher);
    });
  });
});
