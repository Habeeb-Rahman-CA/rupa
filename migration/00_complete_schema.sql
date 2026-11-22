-- Complete schema setup for Rupa migration
-- Creates all tables needed by both NestJS API and Supabase backup restore

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Users table (NestJS auth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying(255) NOT NULL,
  "passwordHash" character varying(255) NOT NULL,
  createdAt timestamptz NOT NULL DEFAULT now(),
  updatedAt timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_users_email" UNIQUE (email),
  CONSTRAINT "PK_users_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Refresh tokens
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" text NOT NULL,
  "revokedAt" timestamptz,
  createdAt timestamptz NOT NULL DEFAULT now(),
  updatedAt timestamptz NOT NULL DEFAULT now(),
  "userId" uuid,
  CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY (id),
  CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_hash_active"
  ON public.refresh_tokens ("tokenHash") WHERE "revokedAt" IS NULL;

ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS "jti" varchar(255) NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_jti" ON public.refresh_tokens ("jti");

-- =============================================================================
-- Categories
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense','savings')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_categories_id" PRIMARY KEY (id),
  CONSTRAINT "UQ_categories_owner_name_kind" UNIQUE (owner_id, name, kind)
);

-- =============================================================================
-- People
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.people (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_people_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  occurred_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  category_id uuid,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','debt','opening','transfer','wallet_recharge','wallet_spend','subscription')),
  source_ref_id uuid,
  payment_mode text NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','bank')),
  bank_account_id uuid,
  wallet_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_transactions_id" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "IDX_transactions_owner_date" ON public.transactions (owner_id, occurred_on DESC);

-- =============================================================================
-- Debts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  person_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('i_owe','they_owe')),
  principal numeric(14,2) NOT NULL CHECK (principal > 0),
  outstanding numeric(14,2) NOT NULL CHECK (outstanding >= 0),
  reason text,
  opened_on date NOT NULL DEFAULT current_date,
  closed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_debts_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Debt payments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  transaction_id uuid NOT NULL,
  notes text,
  CONSTRAINT "PK_debt_payments_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Events
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  kind text,
  starts_on date NOT NULL,
  ends_on date,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_events_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Event participants
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.event_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  person_id uuid,
  is_you boolean NOT NULL DEFAULT false,
  CONSTRAINT "PK_event_participants_id" PRIMARY KEY (id),
  CONSTRAINT "UQ_event_participants_event_person" UNIQUE (event_id, person_id)
);

-- =============================================================================
-- Event expenses
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.event_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  transaction_id uuid NOT NULL,
  CONSTRAINT "PK_event_expenses_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Event expense participants
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.event_expense_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_expense_id uuid NOT NULL,
  event_participant_id uuid NOT NULL,
  CONSTRAINT "PK_event_expense_participants_id" PRIMARY KEY (id),
  CONSTRAINT "UQ_event_expense_participants" UNIQUE (event_expense_id, event_participant_id)
);

-- =============================================================================
-- Event settlements
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.event_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  event_participant_id uuid NOT NULL,
  paid_on date NOT NULL DEFAULT current_date,
  transaction_id uuid NOT NULL,
  CONSTRAINT "PK_event_settlements_id" PRIMARY KEY (id),
  CONSTRAINT "UQ_event_settlements_event_participant" UNIQUE (event_id, event_participant_id)
);

-- =============================================================================
-- Bank accounts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  card_type text NOT NULL,
  payment_network text NOT NULL,
  card_number_masked text NOT NULL,
  expiry_date text NOT NULL,
  cardholder_name text NOT NULL,
  account_number_masked text,
  ifsc_code text,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  credit_limit numeric(14,2),
  theme text NOT NULL DEFAULT 'blue',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_bank_accounts_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Wallets
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  theme text NOT NULL DEFAULT 'blue',
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  minimum_balance numeric(14,2) NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'cash',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_wallets_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Wallet transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('recharge','spend')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  occurred_on date NOT NULL DEFAULT current_date,
  category_id uuid,
  funding_mode text CHECK (funding_mode IN ('cash','bank')),
  bank_account_id uuid,
  notes text,
  debit_transaction_id uuid NOT NULL UNIQUE,
  credit_transaction_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('weekly','monthly','quarterly','yearly')),
  start_date date NOT NULL,
  next_renewal_date date NOT NULL,
  end_date date,
  payment_account_id uuid,
  auto_renewal boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','expired')),
  theme text NOT NULL DEFAULT 'slate' CHECK (theme IN ('slate','mint','neon','rose','amber','scarlet','violet')),
  cancelled_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_subscriptions_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Subscription price changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_price_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  old_amount numeric(14,2) NOT NULL CHECK (old_amount > 0),
  new_amount numeric(14,2) NOT NULL CHECK (new_amount > 0),
  effective_on date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_subscription_price_changes_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Subscription renewals
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_renewals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  due_on date NOT NULL,
  renewed_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','skipped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_subscription_renewals_id" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_renewals_sub_due" ON public.subscription_renewals (subscription_id, due_on);

-- =============================================================================
-- Subscription payments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  renewal_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  transaction_id uuid UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_subscription_payments_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Interest entries
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.interest_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  occurred_on date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  stage text NOT NULL DEFAULT 'received' CHECK (stage IN ('received','separated','disposed')),
  separated_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_interest_entries_id" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interest_entries_credit" ON public.interest_entries (owner_id, occurred_on, bank_account_id, amount);

-- =============================================================================
-- Interest disposals
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.interest_disposals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  occurred_on date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  recipient text NOT NULL,
  purpose text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_interest_disposals_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Push subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_push_subscriptions_id" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_subscriptions_owner_endpoint" ON public.push_subscriptions (owner_id, endpoint);

-- =============================================================================
-- Push preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.push_preferences (
  owner_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('renewals','low_balance','budget','daily_expense','daily_confirm')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_push_preferences_id" PRIMARY KEY (owner_id, category)
);

-- =============================================================================
-- Push notification log
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('renewals','low_balance','budget','daily_expense','daily_confirm')),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_push_notification_log_id" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_notification_log_owner_cat_ref" ON public.push_notification_log (owner_id, category, ref);

-- =============================================================================
-- Money held people
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.money_held_people (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  person_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_money_held_people_id" PRIMARY KEY (id),
  CONSTRAINT "UQ_money_held_people_owner_person" UNIQUE (owner_id, person_id)
);

-- =============================================================================
-- Money held transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.money_held_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  held_person_id uuid NOT NULL,
  direction varchar(10) NOT NULL CHECK (direction IN ('received','returned')),
  amount numeric(12,2) NOT NULL,
  occurred_on date NOT NULL,
  payment_mode varchar(10) NOT NULL CHECK (payment_mode IN ('cash','bank')),
  bank_account_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_money_held_transactions_id" PRIMARY KEY (id)
);

-- =============================================================================
-- App settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  ai_api_key text,
  ai_base_url text,
  ai_model text,
  ai_headers jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_app_settings_id" PRIMARY KEY (id)
);

-- =============================================================================
-- Verify all tables
-- =============================================================================
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
