# rupa-api

NestJS backend for the rūpa expense tracker. Provides the authentication API
(registration, login, refresh rotation, logout, current-user profile) backed by
PostgreSQL via TypeORM. Supabase is **not** removed or touched by this service;
the Angular frontend continues to use Supabase until it is migrated separately.

## Stack

- NestJS, TypeScript, TypeORM, PostgreSQL
- Passport + JWT (`@nestjs/jwt`, `passport-jwt`)
- bcrypt (password hashing)
- class-validator / class-transformer (DTO validation)

## Setup

### 1. Install dependencies

```bash
cd rupa-api
npm install
```

### 2. Configure the environment

Copy `.env.example` to `.env` and fill in strong secrets:

```bash
cp .env.example .env
```

Never commit real secrets. `.env.example` contains only placeholder values.

### 3. Database

Create a PostgreSQL database and point `DATABASE_URL` at it. The service uses
TypeORM migrations (`synchronize: false`).

```bash
# Generate a new migration from entity changes
npm run migration:generate -n <Name>

# Apply pending migrations
npm run migration:run
```

Migrations live in `src/migrations/`.

### 4. Run

```bash
# dev (watch)
npm run start:dev

# prod build + run
npm run build
npm run start:prod
```

The API listens on `PORT` (default 3000) with the global prefix `API_PREFIX`
(default `/api`).

### 5. Test

A local PostgreSQL instance is required (the suite connects to
`postgresql://postgres@localhost:5433/rupa` by default).

```bash
npm test            # run once
npm run test:cov    # with coverage
```

## Authentication transport (recommendation)

### Threat context

The Angular app and the NestJS API run on **different origins** (e.g.
`http://localhost:4200` vs `http://localhost:3000`; different ports are
different origins). Tokens must therefore survive cross-origin requests.

### Recommendation: HttpOnly Secure cookies + double-submit CSRF

The API sets `access_token` and `refresh_token` as **HttpOnly, Secure** cookies
and never returns them in response bodies. This prevents JavaScript (and thus
XSS) from reading them, satisfying "never expose sensitive authentication
details." A `csrf_token` cookie (readable by JS) is also set; state-changing
endpoints (`POST /auth/refresh`, `POST /auth/logout`) require the matching
`X-XSRF-TOKEN` header (double-submit cookie pattern), enforced by `CsrfGuard`.

Cookie attributes are environment-driven:
- `COOKIE_SECURE=true` in production (cookies only over HTTPS).
- `COOKIE_SAME_SITE=None` for cross-origin deployment (Angular and API on
  different origins); `Lax` only when Angular and the API share an origin.
- `COOKIE_DOMAIN` set when the API is on a subdomain of the Angular origin.

### Cross-origin notes

With `SameSite=None; Secure`, browsers send the cookies on cross-origin
`fetch`/`XHR` requests **only if the Angular app sends `credentials: 'include'`.**
That is an Angular-side concern (not modified in this phase). If Angular and the
API are deployed on the same origin (e.g. behind a reverse proxy), `SameSite=Lax`
suffices and CSRF risk is lower.

### Why not bearer tokens in localStorage / state

A bearer-token approach would require the Angular app to store the access token
in JavaScript-accessible storage, exposing it to XSS. Returning tokens in the
response body *and* setting them as HttpOnly cookies offers neither the
simplicity of bearer nor the protection of HttpOnly, so it is deliberately
avoided. Short-lived access tokens (default `15m`) plus refresh-token rotation
limit the window of a stolen refresh token, and refresh tokens can be revoked
on logout or suspicion of compromise.

### Never trust `owner_id`

The API never accepts an `owner_id` (or any user identifier) supplied by the
frontend. The authenticated user is resolved exclusively from the validated JWT
subject (`sub`), so a frontend cannot impersonate another user.

## Endpoints (all under `API_PREFIX`, default `/api`)

- `POST /auth/register` — create account (validates DTO, rejects duplicate email)
- `POST /auth/login` — authenticate (generic "invalid credentials" on failure)
- `POST /auth/refresh` — rotate refresh token (CSRF-protected)
- `POST /auth/logout` — revoke refresh token, clear cookies (CSRF-protected)
- `GET /auth/me` — current user profile (access token via HttpOnly cookie or
  `Authorization: Bearer` header)

Sensitive details (password hashes, refresh token hashes) are never stored in
plaintext and never returned in responses.
