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
import { AccountTransfer } from '../src/transfers/account-transfer.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { TransfersController } from '../src/transfers/transfers.controller.js';
import { TransfersService } from '../src/transfers/transfers.service.js';
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

describe('TransfersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "transfers" CASCADE');
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
          entities: [User, RefreshToken, BankAccount, Transaction, AccountTransfer],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, BankAccount, Transaction, AccountTransfer]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        BankAccountsService,
        TransfersService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, BankAccountsController, TransfersController],
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
    baRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "transfers", "transactions", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'xferuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  const bankAccountPayload = (balance: number) => ({
    bank_name: 'HDFC Bank',
    account_name: 'Savings',
    card_type: 'debit',
    payment_network: 'visa',
    card_number_masked: '4329',
    expiry_date: '12/28',
    cardholder_name: 'USER ONE',
    balance,
  });

  async function createAccount(cookies: string, balance: number) {
    const res = await request
      .post('/bank-accounts')
      .set('Cookie', cookies)
      .send(bankAccountPayload(balance))
      .expect(201);
    return res.body.id;
  }

  async function balanceOf(cookies: string, id: string): Promise<number> {
    const ba = await baRepository.findOne({ where: { id } });
    return Number(ba?.balance ?? 0);
  }

  describe('POST /transfers', () => {
    let cookies: string;
    let srcId: string;
    let dstId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      srcId = await createAccount(cookies, 2000);
      dstId = await createAccount(cookies, 1000);
    });

    it('should create a transfer and move money between accounts', async () => {
      const res = await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 750 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(750);
      expect(res.body.source_account_id).toBe(srcId);
      expect(res.body.destination_account_id).toBe(dstId);
      expect(res.body.debit_transaction_id).toBeDefined();
      expect(res.body.credit_transaction_id).toBeDefined();

      expect(await balanceOf(cookies, srcId)).toBe(1250);
      expect(await balanceOf(cookies, dstId)).toBe(1750);
    });

    it('should reject same source and destination', async () => {
      await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: srcId, amount: 100 })
        .expect(400);
    });

    it('should reject insufficient source balance', async () => {
      await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 5000 })
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request.post('/transfers').send({ source_account_id: srcId, destination_account_id: dstId, amount: 100 }).expect(401);
    });
  });

  describe('GET /transfers', () => {
    let cookies: string;
    let srcId: string;
    let dstId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      srcId = await createAccount(cookies, 2000);
      dstId = await createAccount(cookies, 1000);
      await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 100 })
        .expect(201);
      await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 200 })
        .expect(201);
    });

    it('should return the authenticated user transfers ordered by date desc', async () => {
      const res = await request.get('/transfers').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].amount).toBe(200);
      expect(res.body[1].amount).toBe(100);
    });
  });

  describe('PATCH /transfers/:id', () => {
    let transferId: string;
    let srcId: string;
    let dstId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      srcId = await createAccount(cookies, 2000);
      dstId = await createAccount(cookies, 1000);
      const res = await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 300 })
        .expect(201);
      transferId = res.body.id;
    });

    it('should update an owned transfer and rebalance accounts', async () => {
      const srcBefore = await balanceOf(cookies, srcId);
      const res = await request
        .patch(`/transfers/${transferId}`)
        .set('Cookie', cookies)
        .send({ amount: 100 })
        .expect(200);
      expect(res.body.amount).toBe(100);
      // Source got back 300 then lost 100 => net +200 from 1700 => 1900.
      // Destination lost 300 then gained 100 => net -200 from 1300 => 1100.
      expect(await balanceOf(cookies, srcId)).toBe(srcBefore + 200);
      expect(await balanceOf(cookies, dstId)).toBe(1100);
    });

    it('should reject updating another user transfer', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .patch(`/transfers/${transferId}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ amount: 100 })
        .expect(404);
    });
  });

  describe('DELETE /transfers/:id', () => {
    let transferId: string;
    let srcId: string;
    let dstId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      srcId = await createAccount(cookies, 2000);
      dstId = await createAccount(cookies, 1000);
      const res = await request
        .post('/transfers')
        .set('Cookie', cookies)
        .send({ source_account_id: srcId, destination_account_id: dstId, amount: 300 })
        .expect(201);
      transferId = res.body.id;
    });

    it('should delete and revert balances', async () => {
      const srcBefore = await balanceOf(cookies, srcId);
      const dstBefore = await balanceOf(cookies, dstId);
      await request.delete(`/transfers/${transferId}`).set('Cookie', cookies).expect(200);
      expect(await balanceOf(cookies, srcId)).toBe(srcBefore + 300);
      expect(await balanceOf(cookies, dstId)).toBe(dstBefore - 300);
    });

    it('should reject deleting another user transfer', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request.delete(`/transfers/${transferId}`).set('Cookie', cookieHeader(bCookie)).expect(404);
    });

    it('should reject unauthenticated delete', async () => {
      await request.delete(`/transfers/${transferId}`).expect(401);
    });
  });
});
