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

describe('TransactionsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let txRepository: Repository<Transaction>;
  let baRepository: Repository<BankAccount>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "bank_accounts" CASCADE');
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
          entities: [User, RefreshToken, BankAccount, Transaction],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, BankAccount, Transaction]),
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
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, BankAccountsController, TransactionsController],
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
    txRepository = dataSource.getRepository(Transaction);
    baRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "transactions", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'txuser@example.com') {
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

  async function createPrimaryAccount(cookies: string) {
    const res = await request
      .post('/bank-accounts')
      .set('Cookie', cookies)
      .send(bankAccountPayload)
      .expect(201);
    return res.body.id;
  }

  describe('POST /transactions', () => {
    let cookies: string;
    let accountId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      accountId = await createPrimaryAccount(cookies);
    });

    it('should create a bank income transaction and increase the balance', async () => {
      const res = await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 1000, direction: 'in', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(1000);
      expect(res.body.direction).toBe('in');
      expect(res.body.bank_account_id).toBe(accountId);
    });

    it('should create a bank expense transaction and decrease the balance', async () => {
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 1000, direction: 'in', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);
      const res = await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 300, direction: 'out', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);
      expect(res.body.direction).toBe('out');
      expect(res.body.amount).toBe(300);
    });

    it('should reject non-positive amount', async () => {
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 0, direction: 'in', payment_mode: 'bank', bank_account_id: accountId })
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request.post('/transactions').send({ amount: 100, direction: 'in' }).expect(401);
    });
  });

  describe('GET /transactions', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      await createPrimaryAccount(cookies);
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 100, direction: 'in', occurred_on: '2026-01-01' })
        .expect(201);
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 200, direction: 'in', occurred_on: '2026-01-02' })
        .expect(201);
    });

    it('should return the authenticated user transactions ordered by date desc', async () => {
      const res = await request.get('/transactions').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].amount).toBe(200);
      expect(res.body[1].amount).toBe(100);
    });
  });

  describe('GET /transactions/balance', () => {
    let cookies: string;
    let accountId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      accountId = await createPrimaryAccount(cookies);
    });

    it('should compute income minus out', async () => {
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 1000, direction: 'in', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);
      await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 250, direction: 'out', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);

      const res = await request.get('/transactions/balance').set('Cookie', cookies).expect(200);
      expect(res.body.balance).toBe(750);
    });

    it('should be isolated per user', async () => {
      const { setCookie: aCookie } = await registerAndCapture('userA@example.com');
      const aAccountId = await createPrimaryAccount(cookieHeader(aCookie));
      await request
        .post('/transactions')
        .set('Cookie', cookieHeader(aCookie))
        .send({ amount: 500, direction: 'in', payment_mode: 'bank', bank_account_id: aAccountId })
        .expect(201);

      const res = await request.get('/transactions/balance').set('Cookie', cookieHeader(aCookie)).expect(200);
      expect(res.body.balance).toBe(500);
    });
  });

  describe('DELETE /transactions/:id', () => {
    let txId: string;
    let accountId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const acct = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send(bankAccountPayload)
        .expect(201);
      accountId = acct.body.id;
      const created = await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 400, direction: 'in', payment_mode: 'bank', bank_account_id: accountId })
        .expect(201);
      txId = created.body.id;
    });

    it('should delete and revert the bank balance', async () => {
      const balBefore = await request
        .get('/transactions/balance')
        .set('Cookie', cookies)
        .expect(200);
      await request.delete(`/transactions/${txId}`).set('Cookie', cookies).expect(200);
      const balAfter = await request
        .get('/transactions/balance')
        .set('Cookie', cookies)
        .expect(200);
      expect(balAfter.body.balance).toBe(balBefore.body.balance - 400);
    });

    it('should reject deleting another user transaction', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request.delete(`/transactions/${txId}`).set('Cookie', cookieHeader(bCookie)).expect(404);
    });

    it('should reject unauthenticated delete', async () => {
      await request.delete(`/transactions/${txId}`).expect(401);
    });
  });
});
