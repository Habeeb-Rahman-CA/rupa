# =============================================================================
# Rupa — Production Deployment Guide
# =============================================================================

## Overview

This guide covers deploying Rupa Phase 5 (Angular frontend + NestJS REST API)
to production. It does NOT cover switching production traffic or deleting
Supabase resources — those require explicit approval.

## Architecture

- **Frontend**: Angular 20, hosted on Vercel
- **Backend**: NestJS REST API, hosted on your chosen platform (Railway, Render, Fly.io, Docker, etc.)
- **Database**: PostgreSQL (managed or self-hosted)
- **Auth**: HttpOnly JWT cookies (access + refresh), double-submit CSRF
- **Push**: web-push with VAPID keys, cron every 15 min (Asia/Kolkata)

## 1. Prerequisites

- A PostgreSQL database (production instance)
- A Vercel account for the Angular frontend
- A hosting platform for the NestJS backend (supports Docker or Node.js)
- Domain name with DNS configured
- SSL/TLS certificates (Vercel provides automatic SSL)

## 2. Database Setup

### 2.1 Provision PostgreSQL

Create a production PostgreSQL database. Note the connection string:
`postgresql://user:password@host:5432/dbname?sslmode=require`

### 2.2 Apply Schema Migrations

The NestJS API uses TypeORM migrations. Run them against the production
database:

```bash
# Build the API
cd rupa-api
npm run build

# Run migrations
npm run migration:run
```

Available migrations:
- `1732000000001_initial` (users table)
- `1732000000002_add_jti_to_refresh_tokens`
- `1732000000003_create_push_tables`
- `1732000000004_create_money_held_tables`

### 2.3 Data Migration (Optional — requires approval)

Do NOT run this until you have explicit approval to switch users to the new
system.

See `migration/01_supabase_to_postgres_data_migration.sql` for the
Supabase-to-PostgreSQL data migration script.

### 2.4 Database Backups

Configure automated daily backups of the production PostgreSQL database.
Retain at least 7 days of backups.

## 3. Backend Deployment (NestJS)

### 3.1 Environment Variables

Copy `deploy/env.production.example` to `.env.production` and fill in all
values. Critical values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Production PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | 32+ random characters (rotate before production) |
| `JWT_REFRESH_SECRET` | 32+ random characters (rotate before production) |
| `VAPID_PUBLIC_KEY` | Web-push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web-push VAPID private key (never expose) |
| `VAPID_SUBJECT` | `https://<your-domain>` |
| `PUSH_CRON_SECRET` | Secret for `x-cron-secret` header on `/push/scheduled` |
| `CORS_ORIGIN` | Production frontend URL (e.g. `https://app.vercel.app`) |
| `COOKIE_DOMAIN` | Production domain for cookies |
| `COOKIE_SECURE` | `true` in production |
| `NODE_ENV` | `production` |

### 3.2 Deploy Options

#### Option A: Docker (recommended)

```bash
# Build
docker build -t rupa-api -f deploy/Dockerfile.api .

# Run
docker run -d \
  --name rupa-api \
  --env-file .env.production \
  -p 3000:3000 \
  rupa-api
```

#### Option B: Node.js directly

```bash
cd rupa-api
npm ci --omit=dev
npm run build
NODE_ENV=production node dist/main.js
```

### 3.3 Health Checks

The API exposes two health endpoints:
- `GET /api/health` — liveness (always returns 200)
- `GET /api/health/ready` — readiness (checks database connectivity)

Configure your load balancer or platform to use `/api/health/ready` for
readiness probes.

### 3.4 Cron / Scheduled Push

The `PushSchedulerService` runs every 15 minutes in `Asia/Kolkata` timezone
via `@nestjs/schedule`. It handles:
- Subscription renewal reminders (3-day window)
- Low wallet balance alerts
- Budget threshold alerts (50/75/90/100%)
- Daily expense summary at 8 AM IST
- Daily confirmation reminder at 10 PM IST

No external cron setup needed — the scheduler runs inside the NestJS process.
Ensure only ONE instance of the API runs the scheduler to avoid duplicate
notifications (use a leader election or single replica).

## 4. Frontend Deployment (Angular on Vercel)

### 4.1 Build Configuration

Update `angular.json` if needed to ensure the production build outputs to
`dist/rupa/browser`.

### 4.2 Environment Variables

Set these in Vercel project settings:

| Variable | Description |
|----------|-------------|
| `apiUrl` | `https://<your-api-domain>/api` |
| `vapidPublicKey` | Web-push VAPID public key (same as backend) |

### 4.3 Deploy

```bash
cd rupa  # Angular project root
vercel --prod
```

The `vercel.json` in `deploy/` configures:
- Static build output to `dist/rupa/browser`
- SPA fallback routing (`index.html` for all routes)
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Asset caching (365 days for `/assets/*`)

## 5. CORS Configuration

The NestJS API must allow the production frontend origin. Set `CORS_ORIGIN`
to your Vercel URL. Do NOT use `*` in production.

## 6. Cookie Security

In production:
- `COOKIE_SECURE=true` (cookies only sent over HTTPS)
- `COOKIE_SAME_SITE=Lax`
- `COOKIE_DOMAIN` set to your production domain
- Access token and refresh token are HttpOnly cookies

## 7. Push Notification Setup

### 7.1 Generate VAPID Keys

```bash
node -e "const webpush = require('web-push'); const keys = webpush.generateVAPIDKeys(); console.log('Public:', keys.publicKey); console.log('Private:', keys.privateKey);"
```

Set `VAPID_PUBLIC_KEY` in both backend `.env.production` and frontend
Vercel env vars. Set `VAPID_PRIVATE_KEY` only in backend `.env.production`.

### 7.2 Service Worker

The Angular service worker handles push subscription at the browser level.
The frontend `PushService.enable()` calls `navigator.serviceWorker.ready`
and subscribes via the Push API, then registers the subscription with the
backend via `POST /push/subscribe`.

## 8. Security Checklist

- [ ] JWT secrets are 32+ random characters, not default values
- [ ] `COOKIE_SECURE=true` in production
- [ ] `CORS_ORIGIN` restricted to production frontend domain
- [ ] `VAPID_PRIVATE_KEY` never exposed to frontend or client code
- [ ] `PUSH_CRON_SECRET` is strong and random
- [ ] Database uses SSL (`sslmode=require`)
- [ ] API runs behind HTTPS (terminated at load balancer or platform)
- [ ] No `@supabase/supabase-js` references in frontend code
- [ ] No frontend `owner_id` used for authorization (backend derives from JWT)
- [ ] All state-changing endpoints use double-submit CSRF (`X-XSRF-TOKEN`)
- [ ] Scheduled endpoint requires `x-cron-secret` header
- [ ] Health check endpoint exposed

## 9. Monitoring

- Configure uptime monitoring on `GET /api/health/ready`
- Set up error tracking (e.g., Sentry) for both frontend and backend
- Monitor cron scheduler execution logs for push notification failures
- Monitor database connection pool usage
- Set up alerts for failed migrations or backup failures

## 10. Rollback

See `deploy/ROLLBACK_PLAN.md` for the complete rollback procedure.
