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
import { InterestEntry, InterestDisposal } from '../src/interest/interest.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { InterestController } from '../src/interest/interest.controller.js';
import { InterestService } from '../src/interest/interest.service.js';
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

describe('InterestController (e2e)', () => {
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
    await pgAdmin.query('DROP TABLE IF EXISTS "interest_disposals" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "interest_entries" CASCADE');
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
          entities: [
            User,
            RefreshToken,
            BankAccount,
            Transaction,
            InterestEntry,
            InterestDisposal,
          ],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          User,
          RefreshToken,
          BankAccount,
          Transaction,
          InterestEntry,
          InterestDisposal,
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        BankAccountsService,
        InterestService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, BankAccountsController, InterestController],
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
      'TRUNCATE TABLE "refresh_tokens", "interest_disposals", "interest_entries", "transactions", "bank_accounts", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'interestuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  async function createAccount(cookies: string, balance = 5000): Promise<string> {
    const res = await request
      .post('/bank-accounts')
      .set('Cookie', cookies)
      .send({
        bank_name: 'HDFC Bank',
        account_name: 'Savings',
        card_type: 'debit',
        payment_network: 'visa',
        card_number_masked: '4329',
        expiry_date: '12/28',
        cardholder_name: 'USER ONE',
        balance,
      })
      .expect(201);
    return res.body.id;
  }

  async function balanceOf(id: string): Promise<number> {
    const row = await dataSource.query(
      'SELECT balance FROM bank_accounts WHERE id = $1',
      [id],
    );
    return Number(row[0]?.balance ?? 0);
  }

  describe('POST /interest/entries', () => {
    it('creates an entry for an owned bank account', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      const res = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({
          bank_account_id: accountId,
          amount: 250.5,
          occurred_on: '2026-01-15',
          notes: '  Q3 credit  ',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(250.5);
      expect(res.body.stage).toBe('received');
      expect(res.body.notes).toBe('Q3 credit');
      expect(res.body.occurred_on).toBe('2026-01-15');

      // Interest must never touch the bank balance.
      expect(await balanceOf(accountId)).toBe(5000);
      const txs = await dataSource.query('SELECT * FROM transactions');
      expect(txs).toHaveLength(0);
    });

    it('rejects a duplicate entry (same date, account, amount)', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      const payload = {
        bank_account_id: accountId,
        amount: 100,
        occurred_on: '2026-01-15',
      };
      await request.post('/interest/entries').set('Cookie', cookies).send(payload).expect(201);
      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send(payload)
        .expect(409);
    });

    it('rejects a bank account owned by another user with 404', async () => {
      const { setCookie: aCookie } = await registerAndCapture('owner-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('owner-b@example.com');
      const accountA = await createAccount(cookieHeader(aCookie));

      await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(bCookie))
        .send({ bank_account_id: accountA, amount: 50 })
        .expect(404);
    });

    it('rejects a non-positive amount with 400', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 0 })
        .expect(400);
    });

    it('rejects unauthenticated requests', async () => {
      await request
        .post('/interest/entries')
        .send({ bank_account_id: '11111111-1111-4111-8111-111111111111', amount: 10 })
        .expect(401);
    });
  });

  describe('GET /interest/entries', () => {
    it('lists only the callers entries ordered by date desc', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100, occurred_on: '2026-01-10' })
        .expect(201);
      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 200, occurred_on: '2026-02-10' })
        .expect(201);

      const res = await request.get('/interest/entries').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].amount).toBe(200); // newest first
      expect(res.body[1].amount).toBe(100);
    });
  });

  describe('PATCH /interest/entries/:id', () => {
    it('updates the stage of an owned entry', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);
      const created = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);

      const res = await request
        .patch(`/interest/entries/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ stage: 'separated' })
        .expect(200);
      expect(res.body.stage).toBe('separated');
    });

    it('returns 404 for another users entry', async () => {
      const { setCookie: aCookie } = await registerAndCapture('stage-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('stage-b@example.com');
      const accountId = await createAccount(cookieHeader(aCookie));
      const created = await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(aCookie))
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);

      await request
        .patch(`/interest/entries/${created.body.id}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ stage: 'disposed' })
        .expect(404);
    });
  });

  describe('DELETE /interest/entries/:id', () => {
    it('deletes an owned entry and cascades its disposals', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);
      const created = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);
      await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 40 })
        .expect(201);

      await request
        .delete(`/interest/entries/${created.body.id}`)
        .set('Cookie', cookies)
        .expect(200);

      const entries = await dataSource.query('SELECT * FROM interest_entries');
      expect(entries).toHaveLength(0);
      const disposals = await dataSource.query('SELECT * FROM interest_disposals');
      expect(disposals).toHaveLength(0);
      // Deleting never touches money tables.
      expect(await balanceOf(accountId)).toBe(5000);
    });

    it('returns 404 for another users entry', async () => {
      const { setCookie: aCookie } = await registerAndCapture('del-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('del-b@example.com');
      const accountId = await createAccount(cookieHeader(aCookie));
      const created = await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(aCookie))
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);

      await request
        .delete(`/interest/entries/${created.body.id}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });
  });

  describe('POST /interest/disposals', () => {
    it('allocates FIFO across the oldest entries first', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      const e1 = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100, occurred_on: '2026-01-01' })
        .expect(201);
      const e2 = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100, occurred_on: '2026-02-01' })
        .expect(201);

      const res = await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 150 })
        .expect(201);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].entry_id).toBe(e1.body.id); // oldest fully covered
      expect(res.body[0].amount).toBe(100);
      expect(res.body[1].entry_id).toBe(e2.body.id); // remainder
      expect(res.body[1].amount).toBe(50);

      // Stage recomputation: fully disposed -> disposed, partial -> received.
      const entries = await dataSource.query(
        'SELECT id, stage FROM interest_entries ORDER BY occurred_on',
      );
      const byId = new Map(entries.map((r: any) => [r.id, r.stage]));
      expect(byId.get(e1.body.id)).toBe('disposed');
      expect(byId.get(e2.body.id)).toBe('received');

      // Disposals never touch money tables.
      expect(await balanceOf(accountId)).toBe(5000);
      const txs = await dataSource.query('SELECT * FROM transactions');
      expect(txs).toHaveLength(0);
    });

    it('rejects a disposal larger than the pending balance', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);
      await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 40 })
        .expect(201);

      const res = await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 70 })
        .expect(400);
      expect(res.body.message).toMatch(/Disposal cannot exceed the available balance/);

      // The failed disposal must not have been persisted.
      const disposals = await dataSource.query('SELECT * FROM interest_disposals');
      expect(disposals).toHaveLength(1);
    });

    it('rejects a non-positive amount with 400', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: -5 })
        .expect(400);
    });
  });

  describe('DELETE /interest/disposals/:id', () => {
    it('deletes a disposal and re-opens its entry stage', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);
      const created = await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);
      const disposal = await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 100 })
        .expect(201);

      await request
        .delete(`/interest/disposals/${disposal.body[0].id}`)
        .set('Cookie', cookies)
        .expect(200);

      const entries = await dataSource.query('SELECT stage FROM interest_entries');
      expect(entries[0].stage).toBe('received');
      expect(created.body.id).toBeDefined();
    });

    it('returns 404 for another users disposal', async () => {
      const { setCookie: aCookie } = await registerAndCapture('dis-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('dis-b@example.com');
      const accountId = await createAccount(cookieHeader(aCookie));
      await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(aCookie))
        .send({ bank_account_id: accountId, amount: 100 })
        .expect(201);
      const disposal = await request
        .post('/interest/disposals')
        .set('Cookie', cookieHeader(aCookie))
        .send({ amount: 50 })
        .expect(201);

      await request
        .delete(`/interest/disposals/${disposal.body[0].id}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });
  });

  describe('GET /interest/summary', () => {
    it('computes received, disposed and a non-negative pending balance', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies);

      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 500, occurred_on: '2026-01-01' })
        .expect(201);
      await request
        .post('/interest/entries')
        .set('Cookie', cookies)
        .send({ bank_account_id: accountId, amount: 300, occurred_on: '2026-02-01' })
        .expect(201);
      await request
        .post('/interest/disposals')
        .set('Cookie', cookies)
        .send({ amount: 200 })
        .expect(201);

      const res = await request.get('/interest/summary').set('Cookie', cookies).expect(200);
      expect(res.body.totalReceived).toBe(800);
      expect(res.body.totalDisposed).toBe(200);
      expect(res.body.pendingBalance).toBe(600);
    });

    it('never returns a negative pending balance', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      // Seed a disposal-only state directly (should be unreachable via API).
      await dataSource.query(
        `INSERT INTO interest_entries (id, owner_id, bank_account_id, occurred_on, amount, stage, created_at, updated_at)
         SELECT gen_random_uuid(), u.id, $1, now(), 100, 'received', now(), now() FROM users u LIMIT 1`,
        [(await createAccount(cookies))],
      );
      const entries = await dataSource.query(
        `SELECT e.id FROM interest_entries e JOIN users u ON u.id = e.owner_id WHERE u.email = $1`,
        ['interestuser@example.com'],
      );
      await dataSource.query(
        `INSERT INTO interest_disposals (id, owner_id, entry_id, occurred_on, amount, created_at, updated_at)
         VALUES (gen_random_uuid(), (SELECT id FROM users WHERE email = $1), $2, now(), 300, now(), now())`,
        ['interestuser@example.com', entries[0].id],
      );

      const res = await request.get('/interest/summary').set('Cookie', cookies).expect(200);
      expect(res.body.totalReceived).toBe(100);
      expect(res.body.totalDisposed).toBe(300);
      expect(res.body.pendingBalance).toBe(0);
    });
  });

  describe('cross-user isolation', () => {
    it('scopes list and summary to the authenticated user', async () => {
      const { setCookie: aCookie } = await registerAndCapture('iso-a@example.com');
      const { setCookie: bCookie } = await registerAndCapture('iso-b@example.com');
      const accountA = await createAccount(cookieHeader(aCookie));
      const accountB = await createAccount(cookieHeader(bCookie));

      await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(aCookie))
        .send({ bank_account_id: accountA, amount: 100 })
        .expect(201);
      await request
        .post('/interest/entries')
        .set('Cookie', cookieHeader(bCookie))
        .send({ bank_account_id: accountB, amount: 999 })
        .expect(201);

      const listB = await request
        .get('/interest/entries')
        .set('Cookie', cookieHeader(bCookie))
        .expect(200);
      expect(listB.body).toHaveLength(1);
      expect(listB.body[0].amount).toBe(999);

      const summaryB = await request
        .get('/interest/summary')
        .set('Cookie', cookieHeader(bCookie))
        .expect(200);
      expect(summaryB.body.totalReceived).toBe(999);
    });
  });
});
