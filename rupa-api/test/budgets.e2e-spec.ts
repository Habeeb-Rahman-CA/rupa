import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { Category } from '../src/categories/categories.entity.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { Budget } from '../src/budgets/budget.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { CategoriesController } from '../src/categories/categories.controller.js';
import { CategoriesService } from '../src/categories/categories.service.js';
import { TransactionsController } from '../src/transactions/transactions.controller.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { BudgetsController } from '../src/budgets/budgets.controller.js';
import { BudgetsService } from '../src/budgets/budgets.service.js';
import { DataSource, Repository } from 'typeorm';
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

describe('BudgetsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let categoryRepository: Repository<Category>;
  let budgetRepository: Repository<Budget>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "budgets" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "categories" CASCADE');
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
          entities: [User, RefreshToken, Category, BankAccount, Transaction, Budget],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, Category, BankAccount, Transaction, Budget]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        CategoriesService,
        TransactionsService,
        BudgetsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [
        AuthController,
        CategoriesController,
        TransactionsController,
        BudgetsController,
      ],
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
    budgetRepository = dataSource.getRepository(Budget);
    userRepository = dataSource.getRepository(User);
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "budgets", "transactions", "categories", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'budgetuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  describe('budgets', () => {
    let cookies: string;
    let categoryId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const cat = await request
        .post('/categories')
        .set('Cookie', cookies)
        .send({ name: 'Groceries', kind: 'expense' })
        .expect(201);
      categoryId = cat.body.id;

      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({
          amount: 300,
          direction: 'out',
          category_id: categoryId,
          source: 'manual',
        })
        .expect(201);
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({
          amount: 200,
          direction: 'out',
          category_id: categoryId,
          source: 'manual',
        })
        .expect(201);
    });

    it('should create a budget and compute spent/remaining/status', async () => {
      const res = await request
        .post('/budgets')
        .set('Cookie', cookies)
        .send({
          name: 'Groceries budget',
          category_id: categoryId,
          amount: 1000,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(1000);
      expect(res.body.spent).toBe(500);
      expect(res.body.remaining).toBe(500);
      expect(res.body.percentage).toBe(50);
      expect(res.body.status).toBe('on_track');
    });

    it('should list only the authenticated user budgets', async () => {
      await request
        .post('/budgets')
        .set('Cookie', cookies)
        .send({
          name: 'Groceries budget',
          category_id: categoryId,
          amount: 1000,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      const bCat = await request
        .post('/categories')
        .set('Cookie', cookieHeader(bCookie))
        .send({ name: 'Food', kind: 'expense' })
        .expect(201);
      await request
        .post('/budgets')
        .set('Cookie', cookieHeader(bCookie))
        .send({
          name: 'User B budget',
          category_id: bCat.body.id,
          amount: 500,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      const res = await request.get('/budgets').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Groceries budget');
    });

    it('should update an owned budget', async () => {
      const created = await request
        .post('/budgets')
        .set('Cookie', cookies)
        .send({
          name: 'Groceries budget',
          category_id: categoryId,
          amount: 1000,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      const res = await request
        .patch(`/budgets/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ amount: 2000 })
        .expect(200);
      expect(res.body.amount).toBe(2000);
      expect(res.body.remaining).toBe(1500);
    });

    it('should reject updating another user budget', async () => {
      const created = await request
        .post('/budgets')
        .set('Cookie', cookies)
        .send({
          name: 'Groceries budget',
          category_id: categoryId,
          amount: 1000,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .patch(`/budgets/${created.body.id}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ amount: 9999 })
        .expect(404);
    });

    it('should delete an owned budget', async () => {
      const created = await request
        .post('/budgets')
        .set('Cookie', cookies)
        .send({
          name: 'Groceries budget',
          category_id: categoryId,
          amount: 1000,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        })
        .expect(201);

      await request.delete(`/budgets/${created.body.id}`).set('Cookie', cookies).expect(200);
      const res = await request.get('/budgets').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(0);
    });
  });
});
