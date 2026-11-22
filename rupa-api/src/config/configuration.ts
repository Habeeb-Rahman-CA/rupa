import { registerAs } from '@nestjs/config';
import * as crypto from 'crypto';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'rupa',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
}));

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));

export const pushConfig = registerAs('push', () => ({
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || undefined,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || undefined,
  vapidSubject: process.env.VAPID_SUBJECT ?? 'https://localhost:3000',
  cronSecret: process.env.PUSH_CRON_SECRET || crypto.randomBytes(32).toString('hex'),
  timeZone: process.env.APP_TIME_ZONE ?? 'Asia/Kolkata',
  renewalWindowDays: parseInt(process.env.PUSH_RENEWAL_WINDOW_DAYS ?? '3', 10),
}));
