import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { Category } from '../src/categories/categories.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { CategoriesController } from '../src/categories/categories.controller.js';
import { CategoriesService } from '../src/categories/categories.service.js';
import { DataSource, Repository } from 'typeorm';
import supertest from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

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

describe('CategoriesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let categoryRepository: Repository<Category>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "refresh_tokens" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "categories" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "users" CASCADE');
    await pgAdmin.destroy();
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: TEST_DB_URL,
          entities: [User, RefreshToken, Category],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, Category]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        CategoriesService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, CategoriesController],
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
    categoryRepository = dataSource.getRepository(Category);
    userRepository = dataSource.getRepository(User);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "categories", "users" RESTART IDENTITY CASCADE',
    );
  });

  // ----- helpers -----

  function normalizeSetCookie(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function cookieValue(
    setCookie: string | string[] | undefined,
    name: string,
  ): string | undefined {
    for (const c of normalizeSetCookie(setCookie)) {
      const kv = c.split(';')[0];
      const eq = kv.indexOf('=');
      if (eq === -1) continue;
      if (kv.slice(0, eq) === name) return kv.slice(eq + 1);
    }
    return undefined;
  }

  async function registerAndCapture(email = 'catuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return {
      setCookie: res.headers['set-cookie'],
      body: res.body,
    };
  }

  function cookieHeader(setCookie: string | string[] | undefined): string {
    return normalizeSetCookie(setCookie)
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
  }

  describe('POST /categories', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should create a category and return it', async () => {
      const res = await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: 'Food', kind: 'expense' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Food');
      expect(res.body.kind).toBe('expense');
      expect(res.body.owner_id).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('should order list by kind then name', async () => {
      await request.post('/categories').set('Cookie', cookies).send({ name: 'Zebra', kind: 'expense' }).expect(201);
      await request.post('/categories').set('Cookie', cookies).send({ name: 'Alpha', kind: 'income' }).expect(201);
      await request.post('/categories').set('Cookie', cookies).send({ name: 'Beta', kind: 'expense' }).expect(201);

      const res = await request.get('/categories').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].kind).toBe('expense');
      expect(res.body[0].name).toBe('Beta');
      expect(res.body[1].kind).toBe('expense');
      expect(res.body[1].name).toBe('Zebra');
      expect(res.body[2].kind).toBe('income');
      expect(res.body[2].name).toBe('Alpha');
    });

    it('should reject duplicate category for same owner', async () => {
      await request.post('/categories').set('Cookie', cookies).send({ name: 'Food', kind: 'expense' }).expect(201);
      const res = await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: 'Food', kind: 'expense' })
        .expect(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid kind', async () => {
      await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: 'Food', kind: 'invalid' as any })
        .expect(400);
    });

    it('should reject empty name', async () => {
      await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: '', kind: 'expense' })
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request.post('/categories').send({ name: 'Food', kind: 'expense' }).expect(401);
    });
  });

  describe('GET /categories', () => {
    it('should return only the authenticated user categories', async () => {
      const { setCookie: aCookie } = await registerAndCapture('userA@example.com');
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');

      await request.post('/categories').set('Cookie', cookieHeader(aCookie)).send({ name: 'Food', kind: 'expense' }).expect(201);
      await request.post('/categories').set('Cookie', cookieHeader(bCookie)).send({ name: 'Rent', kind: 'expense' }).expect(201);

      const res = await request.get('/categories').set('Cookie', cookieHeader(aCookie)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Food');
    });
  });

  describe('DELETE /categories/:id', () => {
    let categoryId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: 'Food', kind: 'expense' })
        .expect(201);
      categoryId = res.body.id;
    });

    it('should delete an owned category', async () => {
      await request.delete(`/categories/${categoryId}`).set('Cookie', cookies).expect(200);

      const remaining = await categoryRepository.find({ where: { owner_id: (await userRepository.findOne({ where: { email: 'catuser@example.com' } }))!.id } });
      expect(remaining).toHaveLength(0);
    });

    it('should reject deleting another user category', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .delete(`/categories/${categoryId}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);

      const stillThere = await categoryRepository.findOne({ where: { id: categoryId } });
      expect(stillThere).not.toBeNull();
    });

    it('should reject deleting a non-existent category', async () => {
      await request
        .delete('/categories/00000000-0000-0000-0000-000000000000')
        .set('Cookie', cookies)
        .expect(404);
    });

    it('should reject unauthenticated delete', async () => {
      await request.delete(`/categories/${categoryId}`).expect(401);
    });
  });
});
