import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../src/auth/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.js';
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

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let jwtService: JwtService;
  let request: ReturnType<typeof supertest>;

  const TEST_PASSWORD = 'StrongPass123!';

  let pgAdmin: DataSource;

  beforeAll(async () => {
    pgAdmin = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      synchronize: false,
      logging: false,
    });
    await pgAdmin.initialize();
    await pgAdmin.query('DROP TABLE IF EXISTS "refresh_tokens" CASCADE');
    await pgAdmin.query('DROP TABLE IF EXISTS "users" CASCADE');
    await pgAdmin.destroy();
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: 'postgresql://postgres@localhost:5433/rupa',
          entities: [User, RefreshToken],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([User, RefreshToken]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'change-me-access-secret-min-32-chars',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        CsrfGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
      controllers: [AuthController],
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
    userRepository = dataSource.getRepository(User);
    refreshTokenRepository = dataSource.getRepository(RefreshToken);
    jwtService = app.get(JwtService);

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  // ----- helpers -----

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

  async function registerAndCapture(email = 'test@example.com') {
    const res = await request
      .post('/auth/register')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
    return {
      cookies: cookieHeader(res.headers['set-cookie']),
      setCookie: res.headers['set-cookie'],
      body: res.body,
    };
  }

  describe('POST /auth/register', () => {
    it('should register a new user, set HttpOnly cookies, and return user info', async () => {
      const { cookies, setCookie, body } = await registerAndCapture();

      expect(body.userId).toBeDefined();
      expect(body.email).toBe('test@example.com');
      expect(body.accessToken).toBeUndefined();
      expect(body.refreshToken).toBeUndefined();

      expect(cookieValue(setCookie, 'access_token')).toBeDefined();
      expect(cookieValue(setCookie, 'refresh_token')).toBeDefined();
      expect(cookieValue(setCookie, 'csrf_token')).toBeDefined();
      expect(cookies.length).toBeGreaterThan(0);
    });

    it('should reject duplicate email', async () => {
      await registerAndCapture();
      const res = await request
        .post('/auth/register')
        .send({ email: 'test@example.com', password: TEST_PASSWORD })
        .expect(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid email', async () => {
      await request
        .post('/auth/register')
        .send({ email: 'invalid-email', password: TEST_PASSWORD })
        .expect(400);
    });

    it('should reject weak password', async () => {
      await request
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'weak' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await registerAndCapture();
    });

    it('should login with valid credentials and set cookies', async () => {
      const res = await request
        .post('/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
      expect(cookieValue(res.headers['set-cookie'], 'access_token')).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      await request
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: TEST_PASSWORD })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    let cookies: string;
    let csrfToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const { cookies: c, setCookie } = await registerAndCapture();
      cookies = c;
      csrfToken = cookieValue(setCookie, 'csrf_token')!;
      refreshToken = cookieValue(setCookie, 'refresh_token')!;
    });

    it('should rotate refresh token and return new tokens as cookies', async () => {
      const res = await request
        .post('/auth/refresh')
        .send({ refreshToken })
        .set('Cookie', cookies)
        .set('X-XSRF-TOKEN', csrfToken)
        .expect(200);

      expect(res.body.userId).toBeDefined();
      expect(res.body.email).toBe('test@example.com');
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();

      const newSetCookie = res.headers['set-cookie'];
      const newRefreshToken = cookieValue(newSetCookie, 'refresh_token');
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(refreshToken);
    });

    it('should reject missing CSRF token', async () => {
      await request
        .post('/auth/refresh')
        .send({ refreshToken })
        .set('Cookie', cookies)
        .expect(403);
    });

    it('should reject invalid refresh token', async () => {
      await request
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .set('Cookie', cookies)
        .set('X-XSRF-TOKEN', csrfToken)
        .expect(401);
    });

    it('should revoke old refresh token after rotation', async () => {
      await request
        .post('/auth/refresh')
        .send({ refreshToken })
        .set('Cookie', cookies)
        .set('X-XSRF-TOKEN', csrfToken)
        .expect(200);

      const user = await userRepository.findOne({
        where: { email: 'test@example.com' },
      });
      const tokens = await refreshTokenRepository.find({
        where: { userId: user!.id },
      });
      const activeTokens = tokens.filter((t) => !t.revokedAt);
      expect(activeTokens.length).toBe(1);
    });
  });

  describe('POST /auth/logout', () => {
    let cookies: string;
    let csrfToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const { cookies: c, setCookie } = await registerAndCapture();
      cookies = c;
      csrfToken = cookieValue(setCookie, 'csrf_token')!;
      refreshToken = cookieValue(setCookie, 'refresh_token')!;
    });

    it('should revoke refresh token and clear cookies', async () => {
      const res = await request
        .post('/auth/logout')
        .send({ refreshToken })
        .set('Cookie', cookies)
        .set('X-XSRF-TOKEN', csrfToken)
        .expect(200);

      expect(res.body.message).toBe('Logged out successfully');

      const user = await userRepository.findOne({
        where: { email: 'test@example.com' },
      });
      const tokens = await refreshTokenRepository.find({
        where: { userId: user!.id },
      });
      expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
    });

    it('should handle logout with missing refresh token gracefully', async () => {
      await request
        .post('/auth/logout')
        .send({ refreshToken: '' })
        .set('Cookie', cookies)
        .set('X-XSRF-TOKEN', csrfToken)
        .expect(200);
    });
  });

  describe('GET /auth/me', () => {
    let cookies: string;

    beforeEach(async () => {
      const { cookies: c } = await registerAndCapture();
      cookies = c;
    });

    it('should return user profile via HttpOnly access_token cookie', async () => {
      const response = await request
        .get('/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.id).toBeDefined();
      expect(response.body.email).toBe('test@example.com');
    });

    it('should return user profile via Bearer access token', async () => {
      const user = await userRepository.findOne({
        where: { email: 'test@example.com' },
      });
      const token = jwtService.sign(
        { sub: user!.id, email: 'test@example.com', type: 'access' },
        { secret: 'change-me-access-secret-min-32-chars', expiresIn: '15m' },
      );
      const response = await request
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.email).toBe('test@example.com');
    });

    it('should reject request without access token', async () => {
      await request.get('/auth/me').expect(401);
    });

    it('should reject request with invalid access token', async () => {
      await request
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Expired access tokens', () => {
    it('should reject an expired access token', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'does-not-matter', email: 'expired@example.com', type: 'access' },
        { secret: 'change-me-access-secret-min-32-chars', expiresIn: -1 },
      );
      await request
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Cross-user access', () => {
    it('should not allow user A to access user B resources', async () => {
      const resA = await registerAndCapture('userA@example.com');
      const resB = await registerAndCapture('userB@example.com');

      const profileA = await request
        .get('/auth/me')
        .set('Cookie', resA.cookies)
        .expect(200);
      expect(profileA.body.email).toBe('userA@example.com');

      const profileB = await request
        .get('/auth/me')
        .set('Cookie', resB.cookies)
        .expect(200);
      expect(profileB.body.email).toBe('userB@example.com');

      // User A's cookie must not resolve to user B
      expect(profileA.body.email).not.toBe('userB@example.com');
    });
  });

  describe('Password security', () => {
    it('should not store plaintext passwords', async () => {
      await registerAndCapture('secure@example.com');

      const user = await userRepository.findOne({
        where: { email: 'secure@example.com' },
      });

      expect(user!.passwordHash).not.toBe(TEST_PASSWORD);
      expect(user!.passwordHash.length).toBeGreaterThan(50);
    });
  });
});
