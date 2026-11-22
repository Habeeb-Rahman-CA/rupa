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
import { Person } from '../src/people/person.entity.js';
import {
  Event,
  EventParticipant,
  EventExpense,
  EventExpenseParticipant,
  EventSettlement,
} from '../src/events/events.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { TransactionsController } from '../src/transactions/transactions.controller.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { EventsController } from '../src/events/events.controller.js';
import { EventsService } from '../src/events/events.service.js';
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

describe('EventsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baRepository: Repository<BankAccount>;
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
    await pgAdmin.query('DROP TABLE IF EXISTS "event_settlements" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "event_expense_participants" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "event_expenses" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "event_participants" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "events" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "transactions" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "bank_accounts" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "people" CASCADE');
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
            Person,
            Event,
            EventParticipant,
            EventExpense,
            EventExpenseParticipant,
            EventSettlement,
          ],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          User,
          RefreshToken,
          BankAccount,
          Transaction,
          Event,
          EventParticipant,
          EventExpense,
          EventExpenseParticipant,
          EventSettlement,
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
        TransactionsService,
        EventsService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [
        AuthController,
        BankAccountsController,
        TransactionsController,
        EventsController,
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
    baRepository = dataSource.getRepository(BankAccount);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE TABLE "refresh_tokens", "event_settlements", "event_expense_participants",
       "event_expenses", "event_participants", "events", "transactions",
       "bank_accounts", "people", "users" RESTART IDENTITY CASCADE`,
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

  async function registerAndCapture(email = 'eventuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  async function createAccount(cookies: string, balance: number) {
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
    const ba = await baRepository.findOne({ where: { id } });
    return Number(ba?.balance ?? 0);
  }

  async function createEvent(cookies: string, name = 'Goa trip') {
    const res = await request
      .post('/events')
      .set('Cookie', cookies)
      .send({ name, starts_on: '2026-12-20' })
      .expect(201);
    return res.body.id as string;
  }

  async function addParticipant(cookies: string, eventId: string, isYou = true) {
    const res = await request
      .post(`/events/${eventId}/participants`)
      .set('Cookie', cookies)
      .send({ is_you: isYou })
      .expect(201);
    return res.body.id as string;
  }

  describe('events CRUD', () => {
    it('creates and lists only the authenticated user events', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);

      await request
        .post('/events')
        .set('Cookie', cookies)
        .send({ name: 'Goa trip', starts_on: '2026-12-20', kind: 'trip' })
        .expect(201);

      const res = await request.get('/events').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Goa trip');
      expect(res.body[0].status).toBe('open');

      const { setCookie: bCookie } = await registerAndCapture('other@example.com');
      const other = await request
        .get('/events')
        .set('Cookie', cookieHeader(bCookie))
        .expect(200);
      expect(other.body).toHaveLength(0);
    });

    it('rejects an empty event name', async () => {
      const { setCookie } = await registerAndCapture();
      await request
        .post('/events')
        .set('Cookie', cookieHeader(setCookie))
        .send({ name: '   ', starts_on: '2026-12-20' })
        .expect(400);
    });

    it('rejects an unauthenticated request', async () => {
      await request.post('/events').send({ name: 'x', starts_on: '2026-12-20' }).expect(401);
    });

    it('rejects reading another user event', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventId = await createEvent(cookies);

      const { setCookie: bCookie } = await registerAndCapture('other@example.com');
      await request
        .get(`/events/${eventId}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
      await request
        .patch(`/events/${eventId}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ name: 'hacked', starts_on: '2026-12-20' })
        .expect(404);
      await request
        .delete(`/events/${eventId}`)
        .set('Cookie', cookieHeader(bCookie))
        .expect(404);
    });
  });

  describe('event expenses', () => {
    it('records an expense ledger row and splits it across participants', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventId = await createEvent(cookies);
      await addParticipant(cookies, eventId, true);
      await addParticipant(cookies, eventId, false);

      const res = await request
        .post(`/events/${eventId}/expenses`)
        .set('Cookie', cookies)
        .send({ description: 'Dinner', amount: 1200, paid_on: '2026-12-21' })
        .expect(201);

      expect(res.body.amount).toBe(1200);
      expect(res.body.transaction_id).toBeDefined();

      const expenses = await request
        .get(`/events/${eventId}/expenses`)
        .set('Cookie', cookies)
        .expect(200);
      expect(expenses.body).toHaveLength(1);

      const tx = await dataSource.getRepository(Transaction).findOne({
        where: { id: res.body.transaction_id },
      });
      expect(tx?.source).toBe('event');
      expect(tx?.direction).toBe('out');
      expect(tx?.amount).toBe(1200);
    });

    it('rejects a non-positive amount', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventId = await createEvent(cookies);

      await request
        .post(`/events/${eventId}/expenses`)
        .set('Cookie', cookies)
        .send({ description: 'Dinner', amount: 0 })
        .expect(400);
    });

    it('rejects adding an expense to another user event', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventId = await createEvent(cookies);

      const { setCookie: bCookie } = await registerAndCapture('other@example.com');
      await request
        .post(`/events/${eventId}/expenses`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ description: 'Dinner', amount: 100 })
        .expect(404);
    });
  });

  describe('settlements', () => {
    it('records a settlement, moves a bank balance, and replaces it on re-record', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies, 5000);
      const eventId = await createEvent(cookies);
      const participantId = await addParticipant(cookies, eventId, true);

      const first = await request
        .post(`/events/${eventId}/settlements`)
        .set('Cookie', cookies)
        .send({
          event_expense_id: '00000000-0000-4000-8000-000000000001',
          event_participant_id: participantId,
          amount: 400,
          direction: 'you_paid',
          payment_mode: 'bank',
          bank_account_id: accountId,
          paid_on: '2026-12-22',
        })
        .expect(201);

      expect(first.body.transaction_id).toBeDefined();
      expect(await balanceOf(accountId)).toBe(4600);

      // Re-recording replaces the previous settlement: reverse then re-apply.
      await request
        .post(`/events/${eventId}/settlements`)
        .set('Cookie', cookies)
        .send({
          event_expense_id: '00000000-0000-4000-8000-000000000001',
          event_participant_id: participantId,
          amount: 400,
          direction: 'you_received',
          payment_mode: 'bank',
          bank_account_id: accountId,
          paid_on: '2026-12-22',
        })
        .expect(201);

      // Reverse of the first (-400 out) restores 5000; the replacement
      // 'you_received' settlement then credits +400 => 5400.
      expect(await balanceOf(accountId)).toBe(5400);

      const settlements = await request
        .get(`/events/${eventId}/settlements`)
        .set('Cookie', cookies)
        .expect(200);
      expect(settlements.body).toHaveLength(1);
    });

    it('rejects a settlement for a participant of another event', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventA = await createEvent(cookies, 'Event A');
      const eventB = await createEvent(cookies, 'Event B');
      const participantOfB = await addParticipant(cookies, eventB, true);

      await request
        .post(`/events/${eventA}/settlements`)
        .set('Cookie', cookies)
        .send({
          event_expense_id: '00000000-0000-4000-8000-000000000001',
          event_participant_id: participantOfB,
          amount: 100,
          direction: 'you_paid',
        })
        .expect(404);
    });

    it('rejects another user recording a settlement', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const eventId = await createEvent(cookies);
      const participantId = await addParticipant(cookies, eventId, true);

      const { setCookie: bCookie } = await registerAndCapture('other@example.com');
      await request
        .post(`/events/${eventId}/settlements`)
        .set('Cookie', cookieHeader(bCookie))
        .send({
          event_expense_id: '00000000-0000-4000-8000-000000000001',
          event_participant_id: participantId,
          amount: 100,
          direction: 'you_paid',
        })
        .expect(404);
    });
  });

  describe('DELETE /events/:id', () => {
    it('reverts linked ledger rows and balances', async () => {
      const { setCookie } = await registerAndCapture();
      const cookies = cookieHeader(setCookie);
      const accountId = await createAccount(cookies, 5000);
      const eventId = await createEvent(cookies);
      const participantId = await addParticipant(cookies, eventId, true);

      const expense = await request
        .post(`/events/${eventId}/expenses`)
        .set('Cookie', cookies)
        .send({ description: 'Cab', amount: 300 })
        .expect(201);

      await request
        .post(`/events/${eventId}/settlements`)
        .set('Cookie', cookies)
        .send({
          event_expense_id: expense.body.id,
          event_participant_id: participantId,
          amount: 150,
          direction: 'you_paid',
          payment_mode: 'bank',
          bank_account_id: accountId,
        })
        .expect(201);

      expect(await balanceOf(accountId)).toBe(4850);

      await request.delete(`/events/${eventId}`).set('Cookie', cookies).expect(200);

      expect(await balanceOf(accountId)).toBe(5000);
      expect(await dataSource.getRepository(Transaction).count()).toBe(0);

      const list = await request.get('/events').set('Cookie', cookies).expect(200);
      expect(list.body).toHaveLength(0);
    });
  });
});
