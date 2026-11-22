import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
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

describe('BankAccountsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accountRepository: Repository<BankAccount>;
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
          entities: [User, RefreshToken, BankAccount],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, BankAccount]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        BankAccountsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, BankAccountsController],
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
    accountRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "bank_accounts", "users" RESTART IDENTITY CASCADE',
    );
  });

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

  function cookieHeader(setCookie: string | string[] | undefined): string {
    return normalizeSetCookie(setCookie)
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
  }

  async function registerAndCapture(email = 'bankuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'], body: res.body };
  }

  const newAccount = {
    bank_name: 'HDFC Bank',
    account_name: 'Salary Account',
    card_type: 'debit',
    payment_network: 'visa',
    card_number_masked: '4329',
    expiry_date: '12/28',
    cardholder_name: 'PRIMARY HOLDER',
    balance: 5000,
  };

  describe('POST /bank-accounts', () => {
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
    });

    it('should create a bank account and mark the first as primary', async () => {
      const res = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send(newAccount)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.bank_name).toBe('HDFC Bank');
      expect(res.body.balance).toBe(5000);
      expect(res.body.is_primary).toBe(true);
    });

    it('should make subsequent accounts non-primary by default', async () => {
      await request.post('/bank-accounts').set('Cookie', cookies).send(newAccount).expect(201);
      const res = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send({ ...newAccount, account_name: 'Second', balance: 2000 })
        .expect(201);
      expect(res.body.is_primary).toBe(false);
    });

    it('should reject invalid card_type', async () => {
      await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send({ ...newAccount, card_type: 'gold' as any })
        .expect(400);
    });

    it('should reject negative balance', async () => {
      await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send({ ...newAccount, balance: -100 })
        .expect(400);
    });

    it('should reject unknown fields (global pipe validation runs for controllers without a method-level pipe)', async () => {
      const res = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send({ ...newAccount, not_a_real_field: 'x' })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('not_a_real_field');
    });

    it('should reject unauthenticated request', async () => {
      await request.post('/bank-accounts').send(newAccount).expect(401);
    });
  });

  describe('GET /bank-accounts', () => {
    it('should return only the authenticated user accounts ordered by created_at desc', async () => {
      const { setCookie: aCookie } = await registerAndCapture('userA@example.com');
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');

      await request.post('/bank-accounts').set('Cookie', cookieHeader(aCookie)).send(newAccount).expect(201);
      await request.post('/bank-accounts').set('Cookie', cookieHeader(bCookie)).send({ ...newAccount, bank_name: 'Bank B' }).expect(201);

      const res = await request.get('/bank-accounts').set('Cookie', cookieHeader(aCookie)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].bank_name).toBe('HDFC Bank');
    });
  });

  describe('PATCH /bank-accounts/:id', () => {
    let accountId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send(newAccount)
        .expect(201);
      accountId = res.body.id;
    });

    it('should update an owned account', async () => {
      const res = await request
        .patch(`/bank-accounts/${accountId}`)
        .set('Cookie', cookies)
        .send({ account_name: 'Renamed Account' })
        .expect(200);
      expect(res.body.account_name).toBe('Renamed Account');
    });

    it('should reject updating another user account', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .patch(`/bank-accounts/${accountId}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ account_name: 'Hacked' })
        .expect(404);
    });

    it('should reject updating a non-existent account', async () => {
      await request
        .patch('/bank-accounts/00000000-0000-0000-0000-000000000000')
        .set('Cookie', cookies)
        .send({ account_name: 'X' })
        .expect(404);
    });
  });

  describe('POST /bank-accounts/:id/set-primary', () => {
    let firstId: string;
    let secondId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const r1 = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send(newAccount)
        .expect(201);
      firstId = r1.body.id;
      const r2 = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send({ ...newAccount, account_name: 'Second', balance: 2000 })
        .expect(201);
      secondId = r2.body.id;
    });

    it('should set the second account as primary and unset the first', async () => {
      await request.post(`/bank-accounts/${secondId}/set-primary`).set('Cookie', cookies).expect(200);

      const res = await request.get('/bank-accounts').set('Cookie', cookies).expect(200);
      const byId = (id: string) => res.body.find((a: any) => a.id === id);
      expect(byId(secondId).is_primary).toBe(true);
      expect(byId(firstId).is_primary).toBe(false);
    });

    it('should reject setting primary on another user account', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .post(`/bank-accounts/${firstId}/set-primary`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });
  });

  describe('DELETE /bank-accounts/:id', () => {
    let accountId: string;
    let cookies: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/bank-accounts')
        .set('Cookie', cookies)
        .send(newAccount)
        .expect(201);
      accountId = res.body.id;
    });

    it('should delete an owned account', async () => {
      await request.delete(`/bank-accounts/${accountId}`).set('Cookie', cookies).expect(200);
      const remaining = await accountRepository.find({ where: { owner_id: (await userRepository.findOne({ where: { email: 'bankuser@example.com' } }))!.id } });
      expect(remaining).toHaveLength(0);
    });

    it('should reject deleting another user account', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .delete(`/bank-accounts/${accountId}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });

    it('should reject unauthenticated delete', async () => {
      await request.delete(`/bank-accounts/${accountId}`).expect(401);
    });
  });
});
