# Setup Guide

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in (GitHub or email).
2. Click **New project**.
   - **Name:** `rupa` (or anything)
   - **Password:** generate a strong one and save it in your password manager
   - **Region:** pick the closest to you
   - **Plan:** Free
3. Wait ~1 minute for the project to provision.

## 2. Run the database migrations

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Run every file in `db/migrations/` in numeric order, from `0001_init.sql` through the latest migration.
   Apply each file as a separate query so a failure identifies the exact migration that needs attention.
4. Click **Run** for each file. You should see `Success. No rows returned`.
5. Open **Table Editor** to confirm the tables were created, including `bank_accounts` and `app_settings`.

The migrations are additive. Applying a newer migration to an existing project
does not delete existing transactions, debts, events, categories, people, or
bank-account rows. After migrations `0006` and `0007` are applied, the app imports legacy
bank-account and OpenRouter settings data from the browser on the next
authenticated load, then clears the old localStorage copy only after Supabase
confirms that it was written and can be read back.

Migration `0007` also repairs older projects that already have an
`app_settings` key/value table with a unique `key_name` column. It renames that
old table to `app_settings_legacy` instead of deleting it, then creates the
owner-scoped table used by the current app.

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

Open http://localhost:4200 — you should see the rūpa login page.

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

## 8. Web Push notifications (one-time backend setup)

Push sending runs entirely on Supabase: an Edge Function holds the VAPID
private key and pg_cron triggers the scheduled checks. The Angular app only
registers devices — it never sends anything and never sees the private key.

1. **Apply migration `0017_push_notifications.sql`** (SQL Editor, like the
   others). It creates the subscription/preference/log tables and schedules a
   job called `rupa-push-notifications` every 15 minutes.
   - The schedule needs the **`pg_cron` and `pg_net`** extensions. The
     migration tries to create them; if they are missing it still succeeds and
     prints a notice. Enable both under *Database → Extensions*, then re-run
     **section 4** (the `do $$ …` block at the bottom) of the migration.
2. **Deploy the function** (JWT verification must be OFF — the function does
   its own auth, because pg_cron cannot present a JWT):
   ```sh
   supabase functions deploy push-notifications --no-verify-jwt
   ```
   (CLI config is in `supabase/config.toml`; if you deploy from the
   dashboard, turn the **Verify JWT** toggle *off* for this function.)
3. **Set the VAPID secrets** — both keys are in the gitignored `.env` file at
   the repo root:
   ```sh
   supabase secrets set \
     VAPID_PUBLIC_KEY=...from-.env... \
     VAPID_PRIVATE_KEY=...from-.env...
   ```
   Never put the private key in `src/`, a migration, or git.
4. **Check the schedule** — the cron secret the scheduler authenticates with
   lives only in the database:
   ```sql
   select value from public.push_config where name = 'cron_secret';
   select jobid, schedule from cron.job where jobname = 'rupa-push-notifications';
   ```
5. **Use it in the app** — sign in, open **Settings → Push notifications**,
   press *Turn on notifications*, then *Send test*.

Notes:
- Categories: **Renewals** (active subscriptions within 3 days) and
  **Low balance** (wallet balance at/below its alert level), plus a manual
  **test**. Each event fires at most once per renewal date / per wallet per day.
- Android Chrome works in the browser or installed PWA. iOS 16.4+ only allows
  web push for sites **added to the Home Screen** (Share → Add to Home Screen).
- Denied permission cannot be re-prompted — it must be re-enabled in the
  browser's site settings; the Settings page says so when detected.
