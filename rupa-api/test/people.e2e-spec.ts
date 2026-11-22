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
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
import { PeopleController } from '../src/people/people.controller.js';
import { PeopleService } from '../src/people/people.service.js';
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

describe('PeopleController (e2e)', () => {
  let app: INestApplication;
  let personRepository: Repository<Person>;
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
          entities: [User, RefreshToken, Person],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken, Person]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        PeopleService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController, PeopleController],
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

    personRepository = app.get(DataSource).getRepository(Person);
    userRepository = app.get(DataSource).getRepository(User);
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const ds = app.get(DataSource);
    await ds.query(
      'TRUNCATE TABLE "refresh_tokens", "people", "users" RESTART IDENTITY CASCADE',
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

  async function registerAndCapture(email = 'peopleuser@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: 'StrongPass123!' })
      .expect(201);
    return { setCookie: res.headers['set-cookie'] };
  }

  describe('people CRUD', () => {
    let cookies: string;
    let personId: string;

    beforeEach(async () => {
      const { setCookie } = await registerAndCapture();
      cookies = cookieHeader(setCookie);
      const res = await request
        .post('/people')
        .set('Cookie', cookies)
        .send({ name: 'Ravi Sharma', phone: '+91 99999 99999', notes: 'Friend' })
        .expect(201);
      personId = res.body.id;
    });

    it('should create and list a person', async () => {
      const res = await request.get('/people').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Ravi Sharma');
    });

    it('should update an owned person', async () => {
      const res = await request
        .patch(`/people/${personId}`)
        .set('Cookie', cookies)
        .send({ name: 'Ravi S.', notes: 'Close friend' })
        .expect(200);
      expect(res.body.name).toBe('Ravi S.');
      expect(res.body.notes).toBe('Close friend');
    });

    it('should reject updating another user person', async () => {
      const { setCookie: bCookie } = await registerAndCapture('userB@example.com');
      await request
        .patch(`/people/${personId}`)
        .set('Cookie', cookieHeader(bCookie))
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('should delete an owned person', async () => {
      await request.delete(`/people/${personId}`).set('Cookie', cookies).expect(200);
      const res = await request.get('/people').set('Cookie', cookies).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('should reject unauthenticated access', async () => {
      await request.get('/people').expect(401);
      await request.post('/people').send({ name: 'X' }).expect(401);
    });
  });
});
