# Setup Guide

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in (GitHub or email).
2. Click **New project**.
   - **Name:** `rupa` (or anything)
   - **Password:** generate a strong one and save it in your password manager
   - **Region:** pick the closest to you
   - **Plan:** Free
3. Wait ~1 minute for the project to provision.

## 2. Run the schema migration

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `db/migrations/0001_init.sql` from this repo, copy the entire contents, paste into the editor.
4. Click **Run**. You should see `Success. No rows returned`.
5. Open **Table Editor** to confirm the tables were created (categories, people, transactions, debts, events, etc.).

## 3. Enable email/password auth

1. Go to **Authentication → Providers**.
2. Ensure **Email** is enabled (it is by default).
3. For faster local dev, go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email" (you can turn it back on later).

## 4. Create your user

1. Go to **Authentication → Users → Add user → Create new user**.
2. Enter your email + password. Set **Auto Confirm User** = ON.

## 5. Copy your API keys into the app

1. In Supabase dashboard, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public key**.
3. Open `src/environments/environment.development.ts` and `src/environments/environment.ts`.
4. Replace the placeholders:
   ```ts
   supabase: {
     url: 'https://YOUR-PROJECT.supabase.co',
     anonKey: 'YOUR-ANON-KEY',
   }
   ```
5. **Do not commit real keys yet** if this repo goes public. The anon key is safe for client-side use (RLS protects data), but treat it as an environment secret regardless.

## 6. Run the app

```powershell
npm start
```

Open http://localhost:4200 — you should see the default Angular Material starter page.

## 7. Next: build features

See `src/app/features/` — one folder per feature. We'll build in this order:
1. Auth screens (login/signup)
2. Layout shell (responsive nav: side-nav on desktop, bottom-tabs on mobile)
3. Dashboard (balance + this month's totals)
4. Categories & People (master data screens)
5. Transactions (add expense/income)
6. Debts
7. Events (trips/functions)
8. Reports (monthly spending)
