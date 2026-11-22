-- Combined NestJS migrations (run in order)
-- This creates all tables needed by the NestJS API

-- Migration 0: Create users table
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email" text NOT NULL,
  "passwordHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_users_email" UNIQUE ("email"),
  CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
);

-- Migration 1: Create refresh_tokens table
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tokenHash" text NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "userId" uuid,
  CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_hash_active"
  ON "refresh_tokens" ("tokenHash")
  WHERE "revokedAt" IS NULL;

-- Migration 2: Add jti to refresh_tokens
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "jti" varchar(255) NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_jti" ON "refresh_tokens" ("jti");

-- Migration 3: Create push tables
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_owner_endpoint_idx
  ON public.push_subscriptions (owner_id, endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_owner_idx
  ON public.push_subscriptions (owner_id);

CREATE TABLE IF NOT EXISTS public.push_preferences (
  owner_id    uuid not null,
  category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, category)
);

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
  ref         text not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, category, ref)
);

CREATE INDEX IF NOT EXISTS push_notification_log_created_idx
  ON public.push_notification_log (created_at);

-- Migration 4: Create money_held tables
CREATE TABLE IF NOT EXISTS public.money_held_people (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  person_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, person_id)
);

CREATE INDEX IF NOT EXISTS money_held_people_owner_idx
  ON public.money_held_people (owner_id);

CREATE INDEX IF NOT EXISTS money_held_people_person_idx
  ON public.money_held_people (person_id);

CREATE TABLE IF NOT EXISTS public.money_held_transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null,
  held_person_id uuid not null,
  direction      varchar(10) not null check (direction in ('received', 'returned')),
  amount         numeric(12, 2) not null,
  occurred_on    date not null,
  payment_mode   varchar(10) not null check (payment_mode in ('cash', 'bank')),
  bank_account_id uuid,
  notes          text,
  created_at     timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS money_held_transactions_owner_idx
  ON public.money_held_transactions (owner_id);

CREATE INDEX IF NOT EXISTS money_held_transactions_held_person_idx
  ON public.money_held_transactions (held_person_id);

-- Verify tables created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
