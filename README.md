<p align="center">
  <img src="public/rupa-logo-dark.png" alt="rūpa" width="220" />
</p>

<h1 align="center">rūpa</h1>

<p align="center">
  A fast, mobile-first personal expense tracker. Balances, transactions,
  money owed, and split events, all in one place.
</p>

---

## Overview

**rūpa** replaces the manually maintained Excel sheet that most people use
to track personal money. It keeps the spreadsheet's flexibility while making
the everyday tasks (recording an expense, checking a balance, settling a
loan, splitting a trip cost) faster and calmer.

It runs as a Progressive Web App, so you install it to your phone or desktop
once and use it like a native app, offline caching and all.

## Features

### Ledger
- One running account balance, always visible in the header.
- Categorised income and expenses with a two-tap quick-add flow.
- Optional notes and dates on every transaction.
- Signed amounts everywhere (a red minus for outflows, a green plus for
  inflows) with icons and labels so meaning survives grayscale printing and
  colour-blind viewing.

### Owed
- Track loans in both directions (money you owe, money owed to you).
- Every debt automatically posts a linked ledger transaction so the balance
  stays honest.
- Partial or full repayments, marked in a couple of taps.

### Splits (trips and functions)
- Create an event, invite people (create them inline if new).
- Add expenses within the event with per-expense participant selection.
- Equal split is computed for you; each participant sees exactly what they
  owe for the trip.
- Mark participants settled in one click; posts the incoming payment back
  to your ledger.

### Dashboard
- Total balance with a smooth week / month / year spending trend chart.
- Two pastel stat chips for the month's income and expense.
- Direct shortcuts into the pages that matter (Owed, Splits, See all).
- Top categories horizontal scroller with a distinct colour per category.

### Other
- Log in / Sign up with email and password (with "Forgot password" via email).
- Session persists in local storage and refreshes automatically when the app
  returns to the foreground; you rarely see the login screen after the first
  time.
- Installable PWA with proper icons, splash colours, and offline caching.
- Monochrome theme with soft gray canvas and pure white cards, using colour
  only for money semantics and category identification.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | Angular 20 (standalone components, signals) |
| Backend | Supabase (Postgres, Auth, Row-Level Security) |
| UI kit | Angular Material 20, styled to match a custom design language |
| Icons | Lucide |
| Fonts | Inter |
| Charts | Custom lightweight SVG line chart |
| PWA | Angular Service Worker |
| Language | TypeScript 5.9 |

## Getting Started

### Prerequisites
- Node.js 20 or newer
- npm 10 or newer
- A free Supabase project (setup instructions below)

### Install
```bash
npm install
```

### Configure Supabase
Follow the steps in [SETUP.md](./SETUP.md). It walks you through creating
the Supabase project, running the schema migration, and pasting your API
keys into the environment files.

### Run the dev server
```bash
npm start
```
Open `http://localhost:4200`.

### Build for production
```bash
npm run build
```
Artefacts land in `dist/rupa/browser/`. Serve them with any static file host
(Vercel, Netlify, Cloudflare Pages, GitHub Pages, plain nginx).

## Project Structure

```
src/app/
  core/               Auth, Supabase client, route guards, domain models
  features/
    auth/             Login and Sign up
    dashboard/        Home screen (hero, chart, chips, recent activity)
    transactions/    All entries grouped by day + quick-add sheet
    debts/            Owed section + add-debt sheet + pay-debt dialog
    events/           Splits list, detail, create-event and add-expense sheets
    categories/       Master data for expense/income categories
    people/           Master data for people involved in debts and splits
    reports/          Placeholder for future monthly reports
  layout/             Responsive shell (side-nav on desktop, bottom nav on mobile)
  shared/
    components/       Text field, select field, date field, empty state, etc.
    pipes/            Signed money pipe (formats +/- with rupee symbol)

db/migrations/        SQL for tables and Row-Level Security policies
public/               Static assets served as-is (logos, icon pack, manifest)
scripts/              PowerShell helpers (icon generation)
```

## PWA

The service worker is enabled in production builds. Users can install rūpa
from any Chromium browser's install button, iOS Safari's "Add to Home
Screen", or the Android install prompt.

Icons live under `public/icons/` at 8 standard sizes plus a 180 x 180 Apple
touch icon and a multi-size `favicon.ico`. The manifest sets the app name,
theme colour, and splash background.

To regenerate the entire icon pack from the source `public/rupa-icon.png`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gen-icons.ps1
```

## License

Personal project. Use, fork, and adapt freely.
