import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { Person } from '../src/people/person.entity.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { Debt } from '../src/debts/debts.entity.js';
import { DebtPayment } from '../src/debts/debts.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { PeopleController } from '../src/people/people.controller.js';
import { PeopleService } from '../src/people/people.service.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { DebtsController } from '../src/debts/debts.controller.js';
import { DebtsService } from '../src/debts/debts.service.js';
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

describe('DebtsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let debtRepository: Repository<Debt>;
  let personRepository: Repository<Person>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "debt_payments" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "debts" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "people" CASCADE');
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
          entities: [
            User, RefreshToken, Person, BankAccount, Transaction, Debt, DebtPayment,
          ],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          User, RefreshToken, Person, BankAccount, Transaction, Debt, DebtPayment,
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        PeopleService,
        BankAccountsService,
        TransactionsService,
        DebtsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [
        AuthController,
        PeopleController,
        BankAccountsController,
        TransactionsController,
        DebtsController,
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
    debtRepository = dataSource.getRepository(Debt);
    personRepository = dataSource.getRepository(Person);
    bankAccountRepository = dataSource.getRepository(BankAccount);
    userRepository = dataSource.getRepository(User);
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "debt_payments", "debts", "transactions", "people", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'debtsuser@example.com') {
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

  async function createPerson(cookies: string) {
    const res = await request
      .post('/people')
      .set('Cookie', cookies)
      .send({ name: 'Ravi', phone: '+91 99999 99999' })
      .expect(201);
    return res.body.id;
  }

  async function createAccount(cookies: string) {
    const res = await request
      .post('/bank-accounts')
      .set('Cookie', cookies)
      .send(bankAccountPayload)
      .expect(201);
    return res.body.id;
  }

  describe('debts', () => {
    let cookies: string;
    let personId: string;
    let accountId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      personId = await createPerson(cookies);
      accountId = await createAccount(cookies);
    });

    it('should create a they_owe debt with an income transaction', async () => {
      const res = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'they_owe',
          amount: 1000,
          impact: 'income',
          bank_account_id: accountId,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.direction).toBe('they_owe');
      expect(res.body.principal).toBe(1000);
      expect(res.body.outstanding).toBe(1000);
    });

    it('should add a payment and reduce outstanding', async () => {
      const debt = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'they_owe',
          amount: 1000,
          impact: 'none',
        })
        .expect(201);

      const debtId = debt.body.id;

      await request
        .post(`/debts/${debtId}/payments`)
        .set('Cookie', cookies)
        .send({ amount: 400 })
        .expect(201);

      const debts = await request.get('/debts').set('Cookie', cookies).expect(200);
      expect(debts.body[0].outstanding).toBe(600);
      expect(debts.body[0].closed_on).toBeNull();
    });

    it('should close a debt when payment covers outstanding', async () => {
      const debt = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'i_owe',
          amount: 300,
          impact: 'none',
        })
        .expect(201);

      await request
        .post(`/debts/${debt.body.id}/payments`)
        .set('Cookie', cookies)
        .send({ amount: 300 })
        .expect(201);

      const debts = await request.get('/debts').set('Cookie', cookies).expect(200);
      expect(debts.body[0].outstanding).toBe(0);
      expect(debts.body[0].closed_on).not.toBeNull();
    });

    it('should reject payment larger than outstanding', async () => {
      const debt = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'they_owe',
          amount: 200,
          impact: 'none',
        })
        .expect(201);

      await request
        .post(`/debts/${debt.body.id}/payments`)
        .set('Cookie', cookies)
        .send({ amount: 500 })
        .expect(400);
    });

    it('should delete a debt and its linked transactions', async () => {
      const debt = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'they_owe',
          amount: 1000,
          impact: 'income',
          bank_account_id: accountId,
        })
        .expect(201);

      await request.delete(`/debts/${debt.body.id}`).set('Cookie', cookies).expect(200);

      const debts = await request.get('/debts').set('Cookie', cookies).expect(200);
      expect(debts.body).toHaveLength(0);
    });

    it('should reject accessing another user debt', async () => {
      const debt = await request
        .post('/debts')
        .set('Cookie', cookies)
        .send({
          person_id: personId,
          direction: 'they_owe',
          amount: 100,
          impact: 'none',
        })
        .expect(201);

      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .post(`/debts/${debt.body.id}/payments`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ amount: 50 })
        .expect(404);

      await request
        .delete(`/debts/${debt.body.id}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });
  });
});
