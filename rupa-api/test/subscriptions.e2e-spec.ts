import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { Subscription, SubscriptionPayment, SubscriptionRenewal, SubscriptionPriceChange } from '../src/subscriptions/subscriptions.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { TransactionsController } from '../src/transactions/transactions.controller.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { SubscriptionsController } from '../src/subscriptions/subscriptions.controller.js';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service.js';
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

describe('SubscriptionsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let subRepository: Repository<Subscription>;
  let bankAccountRepository: Repository<BankAccount>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "subscription_payments" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "subscription_renewals" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "subscriptions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "bank_accounts" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "refresh_tokens" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "users" CASCADE');
    await pgAdmin.query(
      `create table if not exists public.subscription_renewals (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null,
        subscription_id uuid not null,
        due_on date not null,
        renewed_on date not null,
        amount numeric(14,2) not null check (amount > 0),
        status text not null default 'completed' check (status in ('completed','skipped')),
        notes text,
        created_at timestamptz not null default now()
      )`,
    );
    await pgAdmin.destroy();
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: TEST_DB_URL,
          entities: [User, RefreshToken, BankAccount, Transaction, Subscription, SubscriptionPayment, SubscriptionRenewal, SubscriptionPriceChange],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, BankAccount, Transaction, Subscription, SubscriptionPayment, SubscriptionRenewal, SubscriptionPriceChange]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        BankAccountsService,
        TransactionsService,
        SubscriptionsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, BankAccountsController, TransactionsController, SubscriptionsController],
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
    subRepository = dataSource.getRepository(Subscription);
    bankAccountRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "subscription_payments", "subscription_renewals", "subscriptions", "transactions", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'subuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  const bankAccountPayload = {
    bank_name: 'HDFC Bank',
    account_name: 'Savings',
    card_type: 'debit',
    payment_network: 'visa',
    card_number_masked: '4329',
    expiry_date: '12/28',
    cardholder_name: 'USER ONE',
    balance: 5000,
  };

  async function createAccount(cookies: string) {
    const res = await request
      .post('/bank-accounts')
      .set('Cookie', cookies)
      .send(bankAccountPayload)
      .expect(201);
    return res.body.id;
  }

  async function balanceOf(id: string): Promise<number> {
    const ba = await bankAccountRepository.findOne({ where: { id } });
    return Number(ba?.balance ?? 0);
  }

  describe('subscriptions', () => {
    let cookies: string;
    let accountId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      accountId = await createAccount(cookies);
    });

    it('should create a subscription', async () => {
      const res = await request
        .post('/subscriptions')
        .set('Cookie', cookies)
        .send({
          name: 'Netflix',
          category: 'Entertainment',
          amount: 14.99,
          billing_cycle: 'monthly',
          start_date: '2026-11-01',
          next_renewal_date: '2026-12-01',
          payment_account_id: accountId,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Netflix');
      expect(res.body.amount).toBe(14.99);
      expect(res.body.status).toBe('active');
    });

    it('should record a payment, advance renewal, and debit the bank account', async () => {
      const sub = await request
        .post('/subscriptions')
        .set('Cookie', cookies)
        .send({
          name: 'Netflix',
          amount: 14.99,
          billing_cycle: 'monthly',
          start_date: '2026-11-01',
          next_renewal_date: '2026-12-01',
          payment_account_id: accountId,
        })
        .expect(201);

      const subId = sub.body.id;
      const balBefore = await balanceOf(accountId);

      const res = await request
        .post(`/subscriptions/${subId}/payments`)
        .set('Cookie', cookies)
        .send({ amount: 14.99, paid_on: '2026-12-01', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);

      expect(res.body.amount).toBe(14.99);
      expect(await balanceOf(accountId)).toBe(balBefore - 14.99);

      const updated = await request.get(`/subscriptions/${subId}`).set('Cookie', cookies).expect(200);
      // monthly advance: 2026-12-01 -> 2027-01-01
      expect(updated.body.next_renewal_date).toBe('2027-01-01');
    });

    it('should reject a payment for a missing subscription', async () => {
      await request
        .post('/subscriptions/00000000-0000-0000-0000-000000000999/payments')
        .set('Cookie', cookies)
        .send({ amount: 10 })
        .expect(404);
    });

    it('should reject cross-user subscription access', async () => {
      const sub = await request
        .post('/subscriptions')
        .set('Cookie', cookies)
        .send({
          name: 'Netflix',
          amount: 14.99,
          billing_cycle: 'monthly',
          start_date: '2026-11-01',
          next_renewal_date: '2026-12-01',
        })
        .expect(201);

      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .post(`/subscriptions/${sub.body.id}/payments`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ amount: 10 })
        .expect(404);

      await request
        .delete(`/subscriptions/${sub.body.id}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });

    it('should delete an owned subscription', async () => {
      const sub = await request
        .post('/subscriptions')
        .set('Cookie', cookies)
        .send({
          name: 'Netflix',
          amount: 14.99,
          billing_cycle: 'monthly',
          start_date: '2026-11-01',
          next_renewal_date: '2026-12-01',
        })
        .expect(201);

      await request.delete(`/subscriptions/${sub.body.id}`).set('Cookie', cookies).expect(200);
      const res = await request.get('/subscriptions').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(0);
    });
  });
});
