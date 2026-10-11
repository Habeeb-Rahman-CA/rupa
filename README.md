<p align="center">
  <img src="public/rupa-icon.png" alt="rūpa" width="220" />
</p>

<h1 align="center">rūpa</h1>

<p align="center">
  A fast, calm, mobile-first personal finance tracker. Keep tabs on your liquid balance, daily expenses, loans, and shared group costs in one place.
</p>

---

## What is rūpa?

Most people start tracking money in a spreadsheet, but spreadsheets become tedious on mobile. Traditional budgeting apps often feel bloated, push intrusive ads, or lock basic features behind subscriptions.

**rūpa** is built for clarity and speed. It gives you the flexibility of a personal ledger combined with a clean, tap-friendly interface designed for your phone and desktop. Whether you are logging your morning coffee, checking how much cash you have left, tracking money lent to a friend, or splitting a weekend trip, rūpa lets you handle it in seconds.

---

## Key Features

### 1. Clear Balance and Trends
- **Starting Balance**: Set your current cash or bank starting balance on day one so your running numbers are always accurate.
- **Liquid Cash View**: A hero balance at the top of your dashboard shows exactly where you stand.
- **Spending Trends**: Toggle between week, month, and year views with an interactive line chart to see your spending trajectory over time.
- **Monthly Totals**: Quick visual summaries for your total income, total outflow, and top spending categories for the current month.

### 2. Fast Transaction Logging
- **Two-Tap Quick Add**: Record expenses or income quickly without navigating through complex sub-menus.
- **Visual Clarity**: Clear signed amounts (green for income, red for expenses) designed to remain readable on any screen, in grayscale, or under bright sunlight.
- **Details When You Need Them**: Add optional notes, specific dates, bank account sources, and categories to any transaction.
- **Timeline Organization**: View your transaction history grouped cleanly day by day.

### 3. Owed Money and Loans
- **Both Directions**: Track both money you owe to others and money others owe you.
- **Connected Ledger**: Borrowing or lending records automatically adjust your active balance, keeping your records honest.
- **Quick Settlements**: Record partial repayments or mark debts as fully settled in a single tap.

### 4. Split Events (Trips and Outings)
- **Group Events**: Create shared events for road trips, dinners, flat expenses, or vacations.
- **Add Participants**: Add people easily, with support for reusing your contacts.
- **Flexible Expense Logging**: Record payments made by you for the group with selectable participants per expense.
- **Automatic Math**: The app calculates equal splits automatically, displaying what each participant owes.
- **One-Click Settle**: Settle up with a friend when they pay you back; the reimbursement is automatically credited back to your balance.

### 5. Bank Accounts and Categories
- **Account Management**: Keep track of your balances across multiple bank accounts and cards.
- **Custom Categories**: Organize your spending with distinct categories, visual tags, and colors that match your habits.
- **People Directory**: Manage friends, roommates, and contacts in a central place for debts and split activities.

### 6. Works Offline and Installs as an App
- **Progressive Web App (PWA)**: Install rūpa directly from your browser. It opens in its own window, launches instantly, and feels like a native mobile app.
- **Offline Reliability**: Cached assets allow the application to open and respond quickly even when your network connection drops.

---

## How to Install rūpa on Your Device

You can install rūpa directly from your browser without downloading it from an app store.

### On Android (Chrome or Edge)
1. Open rūpa in your mobile browser.
2. Tap the banner prompt "Install rūpa" or tap the three dots in the top-right corner.
3. Select **Add to Home screen** or **Install app**.
4. The rūpa icon will appear on your home screen and app drawer.

### On iPhone and iPad (Safari)
1. Open rūpa in Safari.
2. Tap the **Share** button (the square with an arrow pointing upward) at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top-right corner.

### On Desktop (Chrome, Edge, Brave)
1. Open rūpa in your desktop browser.
2. Click the install icon in the right side of the address bar, or open the browser menu and select **Install rūpa**.
3. Launch rūpa directly from your dock, taskbar, or desktop.

---

## Getting Started

### 1. Create Your Account
Sign up with your email address and password. Your session remains securely saved on your device so you stay logged in.

### 2. Set Your Starting Balance
Upon first sign-in, use the dashboard banner or the pencil icon next to your balance to input your starting liquid cash amount.

### 3. Log Your First Expense
Tap the quick add button at the bottom of the screen, enter an amount, select a category, and save. Your dashboard balance and monthly totals update immediately.

### 4. Manage Debts and Group Costs
- Head to **Owed** to record loans given or taken.
- Head to **Splits** when you want to track multi-person outings or flatmate shared costs.

---

## Privacy and Data Control

Your financial data is private. Each account is protected with encrypted authentication and database row-level security. Only your authenticated user session has read or write access to your transactions, accounts, debts, and events.

---

## Self-Hosting and Local Development

If you prefer to run or host your own private instance of rūpa:

### Requirements
- Node.js 20 or newer
- npm 10 or newer
- A Supabase project (free tier works well)

### Setup Steps
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Configure your Supabase database and authentication settings by following the step-by-step instructions in [SETUP.md](./SETUP.md).
3. Start the local server:
   ```bash
   npm start
   ```
4. Open `http://localhost:4200` in your browser.

To create an optimized production build:
```bash
npm run build
```
Built assets will be placed in `dist/rupa/browser/` and can be deployed to any static hosting provider (such as Vercel, Netlify, Cloudflare Pages, or GitHub Pages).

---

## License

Personal project. Use, fork, and adapt freely.
