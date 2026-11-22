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
import { Wallet } from '../src/wallets/wallets.entity.js';
import { WalletTransaction } from '../src/wallets/wallets.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { WalletsController } from '../src/wallets/wallets.controller.js';
import { WalletsService } from '../src/wallets/wallets.service.js';
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

describe('WalletsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let walletRepository: Repository<Wallet>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "wallet_transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "wallets" CASCADE');
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
          entities: [User, RefreshToken, BankAccount, Wallet, WalletTransaction, Transaction],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, BankAccount, Wallet, WalletTransaction, Transaction]),
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
        WalletsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [
        AuthController,
        BankAccountsController,
        TransactionsController,
        WalletsController,
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
    walletRepository = dataSource.getRepository(Wallet);
    bankAccountRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "wallet_transactions", "wallets", "transactions", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'walletuser@example.com') {
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

  const walletPayload = { name: 'Pocket Cash', initial_balance: 1000 };

  describe('wallets CRUD', () => {
    let cookies: string;
    let walletId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/wallets')
        .set('Cookie', cookies)
        .send(walletPayload)
        .expect(201);
      walletId = res.body.id;
    });

    it('should create a wallet with balance = initial_balance', async () => {
      const res = await request.get('/wallets').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Pocket Cash');
      expect(res.body[0].balance).toBe(1000);
    });

    it('should update an owned wallet', async () => {
      const res = await request
        .patch(`/wallets/${walletId}`)
        .set('Cookie', cookies)
        .send({ name: 'Renamed Wallet', minimum_balance: 100 })
        .expect(200);
      expect(res.body.name).toBe('Renamed Wallet');
      expect(res.body.minimum_balance).toBe(100);
    });

    it('should reject updating another user wallet', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .patch(`/wallets/${walletId}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('should delete an owned wallet', async () => {
      await request.delete(`/wallets/${walletId}`).set('Cookie', cookies).expect(200);
      const res = await request.get('/wallets').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('wallet transactions', () => {
    let cookies: string;
    let walletId: string;
    let accountId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const w = await request
        .post('/wallets')
        .set('Cookie', cookies)
        .send(walletPayload)
        .expect(201);
      walletId = w.body.id;
      accountId = await createPrimaryAccount(cookies);
    });

    it('should create a wallet spend and reduce the wallet balance', async () => {
      const res = await request
        .post(`/wallets/${walletId}/transactions`)
        .set('Cookie', cookies)
        .send({ kind: 'spend', amount: 300 })
        .expect(201);
      expect(res.body.kind).toBe('spend');
      expect(res.body.amount).toBe(300);

      const wallets = await request.get('/wallets').set('Cookie', cookies).expect(200);
      expect(wallets.body[0].balance).toBe(700);
    });

    it('should create a bank recharge moving money from bank to wallet', async () => {
      const createRes = await request
        .post('/transactions')
        .set('Cookie', cookies)
        .send({ amount: 1000, direction: 'in', payment_mode: 'bank', bank_account_id: accountId });
      console.log('CREATE TX STATUS', createRes.status, 'BODY', JSON.stringify(createRes.body));
      expect(createRes.status).toBe(201);

      const res = await request
        .post(`/wallets/${walletId}/transactions`)
        .set('Cookie', cookies)
        .send({ kind: 'recharge', amount: 400, funding_mode: 'bank', bank_account_id: accountId })
        .expect(201);
      expect(res.body.kind).toBe('recharge');

      const wallets = await request.get('/wallets').set('Cookie', cookies).expect(200);
      expect(wallets.body[0].balance).toBe(1400);
    });

    it('should reject a spend larger than wallet balance', async () => {
      await request
        .post(`/wallets/${walletId}/transactions`)
        .set('Cookie', cookies)
        .send({ kind: 'spend', amount: 2000 })
        .expect(400);
    });

    it('should reject unauthenticated wallet transaction creation', async () => {
      await request
        .post(`/wallets/${walletId}/transactions`)
        .send({ kind: 'spend', amount: 100 })
        .expect(401);
    });
  });
});
