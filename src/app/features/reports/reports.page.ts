import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, UpperCasePipe } from '@angular/common';

import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import {
  LineChartComponent,
  ChartPoint,
} from '../../shared/components/line-chart.component';

import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DebtsService } from '../../core/services/debts.service';
import { EventsService } from '../../core/services/events.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { Category, Transaction, isSavingsCategory, BankAccount } from '../../core/models/domain.models';
import { getCategoryColor, getCategoryIcon } from '../../shared/utils/category-utils';

interface CategoryRow {
  id: string;
  name: string;
  amount: number;
  percent: number;
  color: string;
  icon: string;
}

interface DayRow {
  date: string;
  amount: number;
}

interface BankReportRow extends BankAccount {
  monthlySpend: number;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    UpperCasePipe,
    LucideAngularModule,
    PageHeaderComponent,
    SignedMoneyPipe,
    LineChartComponent,
  ],
  template: `
    <app-page-header
      title="Reports"
      subtitle="A clear look at where your money moves"
    />

    <!-- Month navigator -->
    <div class="month-nav">
      <button
        type="button"
        class="nav-btn"
        (click)="shiftMonth(-1)"
        aria-label="Previous month"
      >
        <lucide-icon name="chevron-left" />
      </button>
      <div class="nav-label">{{ monthDate() | date: 'MMMM y' }}</div>
      <button
        type="button"
        class="nav-btn"
        (click)="shiftMonth(1)"
        [disabled]="!canGoForward()"
        aria-label="Next month"
      >
        <lucide-icon name="chevron-right" />
      </button>
    </div>

    <!-- Monthly summary hero -->
    <section class="hero app-card">
      <div class="stats">
        <div class="stat-card">
          <div class="micro-label">Spent</div>
          <div class="stat-value money-negative">
            {{ monthly().spent | signedMoney: 'out' }}
          </div>
        </div>
        <div class="stat-card">
          <div class="micro-label">Received</div>
          <div class="stat-value money-positive">
            {{ monthly().received | signedMoney: 'in' }}
          </div>
        </div>
        <div class="stat-card">
          <div class="micro-label">Saved</div>
          <div class="stat-value money-savings">
            {{ monthly().saved | signedMoney }}
          </div>
        </div>
        <div class="stat-card">
          <div class="micro-label">Net Cash</div>
          <div
            class="stat-value"
            [class.money-positive]="monthly().net >= 0"
            [class.money-negative]="monthly().net < 0"
          >
            {{ monthly().net | signedMoney }}
          </div>
        </div>
      </div>

      @if (savingsRate() !== null) {
        <div class="savings-row">
          <span class="micro-label">Monthly Savings Rate</span>
          <span
            class="savings-value"
            [class.money-savings]="savingsRate()! >= 0"
            [class.money-negative]="savingsRate()! < 0"
          >
            {{ savingsRate() }}% of income saved
          </span>
        </div>
      }
    </section>

    <!-- Bank & Payment Method Overview -->
    <div class="section-head">
      <h2>Payment Methods</h2>
      <span class="section-hint">Usage breakdown</span>
    </div>

    <section class="bank-reports-section">
      <!-- Cash vs Bank Breakdown Card -->
      <div class="app-card bank-breakdown-card">
        <div class="bank-card-header">
          <div class="bank-header-title">
            <lucide-icon name="wallet" class="head-icon" />
            <span>Cash vs Bank Spend</span>
          </div>
          <span class="section-hint">{{ monthDate() | date: 'MMM y' }}</span>
        </div>

        <div class="payment-split-bars">
          <div class="split-bar-track">
            <div
              class="split-bar-segment bank-seg"
              [style.width.%]="bankVsCashMonthly().bankPct"
              [title]="'Bank: ' + bankVsCashMonthly().bankPct + '%'"
            ></div>
            <div
              class="split-bar-segment cash-seg"
              [style.width.%]="bankVsCashMonthly().cashPct"
              [title]="'Cash: ' + bankVsCashMonthly().cashPct + '%'"
            ></div>
          </div>
          <div class="split-legend">
            <div class="legend-item">
              <span class="dot bank-dot"></span>
              <span class="legend-label">Bank Accounts</span>
              <span class="legend-val">{{ bankVsCashMonthly().bankSpent | signedMoney: 'out' }}</span>
              <span class="legend-pct">({{ bankVsCashMonthly().bankPct }}%)</span>
            </div>
            <div class="legend-item">
              <span class="dot cash-dot"></span>
              <span class="legend-label">Cash</span>
              <span class="legend-val">{{ bankVsCashMonthly().cashSpent | signedMoney: 'out' }}</span>
              <span class="legend-pct">({{ bankVsCashMonthly().cashPct }}%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bank Accounts Summary List -->
      @if (bankAccountRows().length > 0) {
        <div class="app-card-tight bank-list-card">
          <div class="bank-card-header card-header-padded">
            <div class="bank-header-title">
              <lucide-icon name="building-2" class="head-icon" />
              <span>Accounts Overview</span>
            </div>
            <a routerLink="/cards" class="manage-link">
              <span>Manage</span>
              <lucide-icon name="chevron-right" />
            </a>
          </div>

          <ul class="bank-accounts-list">
            @for (acc of bankAccountRows(); track acc.id; let last = $last) {
              <li class="bank-acc-row" [class.last]="last">
                <div class="bank-acc-info">
                  <div class="bank-icon-badge" [attr.data-theme]="acc.theme">
                    <lucide-icon name="credit-card" />
                  </div>
                  <div class="bank-acc-meta">
                    <div class="bank-name-row">
                      <span class="bank-title">{{ acc.account_name || acc.bank_name }}</span>
                      @if (acc.is_primary) {
                        <span class="primary-badge">PRIMARY</span>
                      }
                    </div>
                    <span class="bank-subtext">
                      {{ acc.bank_name }} • {{ acc.card_type | uppercase }}
                    </span>
                  </div>
                </div>

                <div class="bank-acc-metrics">
                  <div class="metric-group">
                    <span class="metric-lbl">Monthly Spend</span>
                    <span class="metric-val money-negative">
                      {{ acc.monthlySpend | signedMoney: 'out' }}
                    </span>
                  </div>
                  <div class="metric-group align-right">
                    <span class="metric-lbl">Current Balance</span>
                    <span class="metric-val font-semibold">
                      {{ acc.balance | signedMoney }}
                    </span>
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      } @else {
        <div class="app-card placeholder-bank">
          <lucide-icon name="credit-card" class="placeholder-icon" />
          <p>No bank accounts linked yet.</p>
          <a routerLink="/cards" class="btn-primary-sm">
            <lucide-icon name="plus" />
            <span>Add Bank Card</span>
          </a>
        </div>
      }
    </section>

    <!-- 12-month expense trend -->
    <div class="section-head">
      <h2>Expense trend</h2>
      <span class="section-hint">Last 12 months</span>
    </div>
    <section class="app-card chart-card">
      @if (trend().length >= 2) {
        <app-line-chart
          [points]="trend()"
          [highlight]="trendHighlight()"
          color="var(--app-ink-dark)"
          [formatter]="chartFormatter"
        />
      } @else {
        <div class="empty">Add expenses over a few months to see the trend.</div>
      }
    </section>

    <!-- Savings breakdown -->
    @if (savingsCategoryRows().length > 0) {
      <div class="section-head">
        <h2>Savings Breakdown</h2>
        <span class="section-hint">{{ monthDate() | date: 'MMM y' }}</span>
      </div>
      <section class="cat-card app-card-tight">
        <ul class="cat-list">
          @for (c of savingsCategoryRows(); track c.id; let last = $last) {
            <li class="cat-row" [class.last]="last">
              <div class="cat-icon" [style.background]="c.color">
                <lucide-icon [name]="c.icon" />
              </div>
              <div class="cat-body">
                <div class="cat-head-row">
                  <span class="cat-name">{{ c.name }}</span>
                  <span class="cat-amount money-savings">
                    {{ c.amount | signedMoney }}
                  </span>
                </div>
                <div class="cat-bar-wrap">
                  <div
                    class="cat-bar"
                    [style.width.%]="c.percent"
                    [style.background]="c.color"
                  ></div>
                </div>
                <div class="cat-pct">{{ c.percent }}% of total monthly savings</div>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <!-- Expense Category breakdown -->
    <div class="section-head">
      <h2>Expenses by category</h2>
      <span class="section-hint">{{ monthDate() | date: 'MMM y' }}</span>
    </div>
    @if (categoryRows().length > 0) {
      <section class="cat-card app-card-tight">
        <ul class="cat-list">
          @for (c of categoryRows(); track c.id; let last = $last) {
            <li class="cat-row" [class.last]="last">
              <div class="cat-icon" [style.background]="c.color">
                <lucide-icon [name]="c.icon" />
              </div>
              <div class="cat-body">
                <div class="cat-head-row">
                  <span class="cat-name">{{ c.name }}</span>
                  <span class="cat-amount money-negative">
                    {{ c.amount | signedMoney: 'out' }}
                  </span>
                </div>
                <div class="cat-bar-wrap">
                  <div
                    class="cat-bar"
                    [style.width.%]="c.percent"
                    [style.background]="c.color"
                  ></div>
                </div>
                <div class="cat-pct">{{ c.percent }}% of expenses</div>
              </div>
            </li>
          }
        </ul>
      </section>
    } @else {
      <div class="app-card placeholder">
        No expenses this month.
      </div>
    }

    <!-- Biggest single days -->
    @if (topDays().length > 0) {
      <div class="section-head">
        <h2>Biggest days</h2>
        <span class="section-hint">Highest spending</span>
      </div>
      <section class="app-card-tight">
        <ul class="day-list">
          @for (d of topDays(); track d.date; let last = $last) {
            <li class="day-row" [class.last]="last">
              <div class="day-label">{{ d.date | date: 'EEE, MMM d' : 'UTC' }}</div>
              <div class="day-amount money-negative">
                {{ d.amount | signedMoney: 'out' }}
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <!-- Outstanding balances -->
    <div class="section-head">
      <h2>Outstanding</h2>
      <span class="section-hint">Right now</span>
    </div>
    <section class="outstanding-grid">
      <a class="ob-card" routerLink="/debts">
        <div class="micro-label">They owe you</div>
        <div class="ob-value money-positive">
          {{ theyOweTotal() | signedMoney: 'in' }}
        </div>
        <div class="ob-hint">Money you're waiting on</div>
      </a>
      <a class="ob-card" routerLink="/debts">
        <div class="micro-label">You owe</div>
        <div class="ob-value money-negative">
          {{ youOweTotal() | signedMoney: 'out' }}
        </div>
        <div class="ob-hint">Money you need to pay back</div>
      </a>
      <a class="ob-card" routerLink="/events">
        <div class="micro-label">Splits open</div>
        <div class="ob-value">{{ openSplitsCount() }}</div>
        <div class="ob-hint">
          {{ splitOutstanding() | signedMoney }} unsettled
        </div>
      </a>
    </section>
  `,
  styles: [
    `
      /* ---------- Month navigator ------------------------------------ */
      .month-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--app-surface);
        border-radius: 999px;
        padding: 6px;
        box-shadow: var(--app-shadow-sm);
        margin-bottom: 16px;
      }
      .nav-btn {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 0;
        background: transparent;
        color: var(--app-ink);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background .15s ease;

        &:hover:not(:disabled) { background: var(--app-canvas); }
        &:disabled { color: var(--app-ink-subtle); cursor: default; }
      }
      .nav-label {
        font-weight: 600;
        font-size: 15px;
        color: var(--app-ink);
        letter-spacing: -0.01em;
      }

      /* ---------- Hero summary --------------------------------------- */
      .hero {
        padding: 16px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      @media (min-width: 640px) {
        .stats {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .stat-card {
        background: var(--app-canvas);
        border-radius: var(--app-radius-md);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
      }
      .stat-value {
        margin-top: 6px;
        font-size: clamp(15px, 4vw, 19px);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        word-break: break-word;
        overflow-wrap: break-word;
        white-space: normal;
        line-height: 1.25;
      }
      .savings-row {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--app-hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .savings-value {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ---------- Bank Reports Section ------------------------------- */
      .bank-reports-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bank-breakdown-card {
        padding: 16px;
      }
      .bank-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .card-header-padded {
        padding: 14px 16px 10px 16px;
        margin-bottom: 0;
      }
      .bank-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: var(--app-ink);
      }
      .head-icon {
        width: 18px;
        height: 18px;
        color: var(--app-ink-muted);
      }
      .manage-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        color: var(--app-ink);
        text-decoration: none;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background .15s ease;

        &:hover {
          background: var(--app-canvas);
        }

        lucide-icon {
          width: 14px;
          height: 14px;
        }
      }

      .payment-split-bars {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .split-bar-track {
        height: 10px;
        background: var(--app-canvas);
        border-radius: 999px;
        display: flex;
        overflow: hidden;
      }
      .split-bar-segment {
        height: 100%;
        transition: width .3s ease;
      }
      .bank-seg {
        background: var(--app-ink-dark, #0f172a);
      }
      .cash-seg {
        background: #94a3b8;
      }
      .split-legend {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .bank-dot { background: var(--app-ink-dark, #0f172a); }
      .cash-dot { background: #94a3b8; }
      .legend-label { color: var(--app-ink-muted); }
      .legend-val { font-weight: 700; color: var(--app-ink); }
      .legend-pct { font-size: 11px; color: var(--app-ink-subtle); }

      .bank-list-card {
        padding: 0;
      }
      .bank-accounts-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .bank-acc-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--app-hairline);

        @media (min-width: 480px) {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }
      .bank-acc-row.last { border-bottom: 0; }

      .bank-acc-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .bank-icon-badge {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        color: #fff;
        background: linear-gradient(135deg, #1e293b, #0f172a);

        &[data-theme='emerald'] { background: linear-gradient(135deg, #059669, #047857); }
        &[data-theme='purple'] { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
        &[data-theme='rose'] { background: linear-gradient(135deg, #e11d48, #be123c); }
        &[data-theme='amber'] { background: linear-gradient(135deg, #d97706, #b45309); }
        &[data-theme='cyan'] { background: linear-gradient(135deg, #0891b2, #0e7490); }
        &[data-theme='dark'] { background: linear-gradient(135deg, #27272a, #09090b); }

        lucide-icon {
          width: 18px;
          height: 18px;
        }
      }
      .bank-acc-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .bank-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .bank-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--app-ink);
      }
      .primary-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--app-ink-dark, #0f172a);
        color: #fff;
        letter-spacing: 0.04em;
      }
      .bank-subtext {
        font-size: 11px;
        color: var(--app-ink-muted);
      }

      .bank-acc-metrics {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-top: 6px;
        border-top: 1px dashed var(--app-hairline);

        @media (min-width: 480px) {
          padding-top: 0;
          border-top: 0;
          justify-content: flex-end;
        }
      }
      .metric-group {
        display: flex;
        flex-direction: column;

        &.align-right {
          text-align: right;
        }
      }
      .metric-lbl {
        font-size: 10px;
        color: var(--app-ink-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .metric-val {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }

      .placeholder-bank {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        text-align: center;
        gap: 10px;

        .placeholder-icon {
          width: 32px;
          height: 32px;
          color: var(--app-ink-subtle);
        }
        p {
          margin: 0;
          font-size: 13px;
          color: var(--app-ink-muted);
        }
      }

      .btn-primary-sm {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--app-ink-dark, #0f172a);
        color: #fff;
        font-weight: 600;
        font-size: 13px;
        text-decoration: none;
        transition: transform .1s ease, opacity .15s ease;

        &:hover { opacity: 0.9; }
        &:active { transform: scale(0.97); }

        lucide-icon {
          width: 14px;
          height: 14px;
        }
      }

      /* ---------- Section headers ------------------------------------ */
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 24px 4px 10px;
      }
      .section-head h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--app-ink);
      }
      .section-hint {
        font-size: 12px;
        color: var(--app-ink-muted);
      }

      /* ---------- Chart card ----------------------------------------- */
      .chart-card {
        padding: 20px 16px;
      }
      .empty {
        color: var(--app-ink-muted);
        font-size: 13px;
        text-align: center;
        padding: 20px 0;
      }

      /* ---------- Category breakdown --------------------------------- */
      .cat-card { }
      .cat-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .cat-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .cat-row.last { border-bottom: 0; }
      .cat-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .cat-icon lucide-icon {
        width: 22px;
        height: 22px;
      }
      .cat-body { min-width: 0; }
      .cat-head-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }
      .cat-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--app-ink);
      }
      .cat-amount {
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
      }
      .cat-bar-wrap {
        height: 6px;
        border-radius: 999px;
        background: var(--app-canvas);
        margin-top: 8px;
        overflow: hidden;
      }
      .cat-bar {
        height: 100%;
        border-radius: 999px;
        min-width: 4px;
        transition: width .3s ease;
      }
      .cat-pct {
        margin-top: 4px;
        font-size: 11px;
        color: var(--app-ink-muted);
      }

      /* ---------- Biggest days --------------------------------------- */
      .day-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .day-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .day-row.last { border-bottom: 0; }
      .day-label {
        font-size: 14px;
        color: var(--app-ink);
      }
      .day-amount {
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ---------- Outstanding balances ------------------------------- */
      .outstanding-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: 18px
      }
      .ob-card {
        background: var(--app-surface);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-md);
        padding: 14px 16px;
        text-decoration: none;
        color: inherit;
        min-width: 0;
        transition: transform .1s ease;

        &:active { transform: scale(0.98); }
      }
      .ob-value {
        margin-top: 6px;
        font-size: clamp(16px, 4.5vw, 20px);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ob-hint {
        margin-top: 4px;
        font-size: 11px;
        color: var(--app-ink-muted);
      }

      .placeholder {
        color: var(--app-ink-muted);
        font-size: 14px;
        text-align: center;
      }
    `,
  ],
})
export class ReportsPage {
  private readonly txService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly debtsService = inject(DebtsService);
  private readonly eventsService = inject(EventsService);
  private readonly bankAccountsService = inject(BankAccountsService);

  // Selected month state — Date pinned to day 1
  readonly monthDate = signal<Date>(startOfMonth(new Date()));

  readonly canGoForward = computed(() => {
    const now = startOfMonth(new Date());
    return this.monthDate() < now;
  });

  constructor() {
    effect(() => {
      const txs = this.txService.transactions();
      if (txs.length > 0) {
        const latestIso = txs[0].occurred_on;
        const [y, m] = latestIso.split('-').map(Number);
        const latestMonth = new Date(y, m - 1, 1);
        const nowMonth = startOfMonth(new Date());
        if (latestMonth < nowMonth && this.monthly().spent === 0 && this.monthly().received === 0 && this.monthly().saved === 0) {
          this.monthDate.set(latestMonth);
        }
      }
    });
  }

  readonly monthly = computed(() => {
    const { y, m } = ym(this.monthDate());
    const categories = this.categoriesService.categories();
    let spent = 0;
    let received = 0;
    let saved = 0;
    for (const t of this.txService.transactions()) {
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      const amt = Number(t.amount);
      const cat = t.category_id ? categories.find((c) => c.id === t.category_id) : null;
      const isSavings = isSavingsCategory(cat);

      if (isSavings) {
        if (t.direction === 'out') saved += amt;
        else if (t.direction === 'in') saved -= amt;
      } else if (t.direction === 'out') {
        spent += amt;
      } else if (t.direction === 'in') {
        received += amt;
      }
    }
    return { spent, received, saved, net: received - spent - saved };
  });

  readonly bankVsCashMonthly = computed(() => {
    const { y, m } = ym(this.monthDate());
    let bankSpent = 0;
    let cashSpent = 0;
    let totalSpent = 0;

    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      const amt = Number(t.amount);
      if (t.payment_mode === 'bank') {
        bankSpent += amt;
      } else {
        cashSpent += amt;
      }
      totalSpent += amt;
    }

    const bankPct = totalSpent > 0 ? Math.round((bankSpent / totalSpent) * 100) : 0;
    const cashPct = totalSpent > 0 ? Math.round((cashSpent / totalSpent) * 100) : 0;

    return { bankSpent, cashSpent, totalSpent, bankPct, cashPct };
  });

  readonly bankAccountRows = computed<BankReportRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const accounts = this.bankAccountsService.bankAccounts();

    const accountSpendMap = new Map<string, number>();
    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out' || t.payment_mode !== 'bank') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      if (t.bank_account_id) {
        accountSpendMap.set(
          t.bank_account_id,
          (accountSpendMap.get(t.bank_account_id) ?? 0) + Number(t.amount)
        );
      }
    }

    return accounts.map((acc) => ({
      ...acc,
      monthlySpend: accountSpendMap.get(acc.id) ?? 0,
    }));
  });

  readonly savingsRate = computed<number | null>(() => {
    const { saved, received } = this.monthly();
    if (received <= 0) return null;
    const rate = (saved / received) * 100;
    return Math.round(rate);
  });

  readonly trend = computed<ChartPoint[]>(() => {
    const anchor = this.monthDate();
    const buckets: ChartPoint[] = [];
    const catsMap = new Map(
      this.categoriesService.categories().map((c) => [c.id, c.kind]),
    );

    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('en-US', { month: 'short' }).slice(0, 1),
        value: 0,
      });
    }
    const startY = anchor.getFullYear();
    const startM = anchor.getMonth() - 11;

    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out') continue;
      if (t.category_id && catsMap.get(t.category_id) === 'savings') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      const idx = (ty - startY) * 12 + (tm - 1 - startM);
      if (idx < 0 || idx >= 12) continue;
      buckets[idx].value += Number(t.amount);
    }
    return buckets;
  });

  readonly trendHighlight = computed<number | null>(() => {
    const c = this.trend();
    if (c.length === 0) return null;
    return c.length - 1;
  });

  readonly chartFormatter = (v: number): string =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(v);

  readonly categoryMap = computed(() => {
    const map = new Map<string, Category>();
    for (const c of this.categoriesService.categories()) {
      map.set(c.id, c);
    }
    return map;
  });

  readonly savingsCategoryRows = computed<CategoryRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const catMap = this.categoryMap();
    const totals = new Map<string, number>();
    let sum = 0;

    for (const t of this.txService.transactions()) {
      if (!t.occurred_on || !t.occurred_on.startsWith(prefix)) continue;
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      if (!isSavingsCategory(cat)) continue;
      const key = t.category_id ?? '__savings__';
      const amt = Number(t.amount);
      totals.set(key, (totals.get(key) ?? 0) + amt);
      sum += amt;
    }
    if (sum === 0) return [];

    return [...totals.entries()]
      .map(([id, amount]) => {
        const cat = catMap.get(id);
        const name = cat?.name ?? 'Savings';
        return {
          id,
          name,
          amount,
          percent: Math.round((amount / sum) * 100),
          color: getCategoryColor(name),
          icon: getCategoryIcon(name),
        };
      })
      .sort((a, b) => b.amount - a.amount);
  });

  readonly categoryRows = computed<CategoryRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const catMap = this.categoryMap();
    const totals = new Map<string, number>();
    let sum = 0;

    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out' || !t.occurred_on || !t.occurred_on.startsWith(prefix)) continue;
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      if (isSavingsCategory(cat)) continue;
      const key = t.category_id ?? '__uncategorized__';
      const amt = Number(t.amount);
      totals.set(key, (totals.get(key) ?? 0) + amt);
      sum += amt;
    }
    if (sum === 0) return [];

    return [...totals.entries()]
      .map(([id, amount]) => {
        const cat = catMap.get(id);
        const name = cat?.name ?? 'Uncategorized';
        return {
          id,
          name,
          amount,
          percent: Math.round((amount / sum) * 100),
          color: getCategoryColor(name),
          icon: getCategoryIcon(name),
        };
      })
      .sort((a, b) => b.amount - a.amount);
  });

  readonly topDays = computed<DayRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const catMap = this.categoryMap();
    const byDay = new Map<string, number>();
    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out' || !t.occurred_on || !t.occurred_on.startsWith(prefix)) continue;
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      if (cat?.kind === 'savings') continue;
      byDay.set(t.occurred_on, (byDay.get(t.occurred_on) ?? 0) + Number(t.amount));
    }
    return [...byDay.entries()]
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  });

  readonly theyOweTotal = this.debtsService.theyOweYouTotal;
  readonly youOweTotal = this.debtsService.youOweTotal;

  readonly openSplitsCount = computed(
    () => this.eventsService.events().filter((e) => e.status === 'open').length,
  );

  readonly splitOutstanding = computed(() => {
    return 0;
  });

  shiftMonth(delta: number): void {
    const cur = this.monthDate();
    const next = new Date(cur.getFullYear(), cur.getMonth() + delta, 1);
    const now = startOfMonth(new Date());
    if (next > now) return;
    this.monthDate.set(next);
  }
}

// -------- helpers -----------------------------------------------------------

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function ym(d: Date): { y: number; m: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}


