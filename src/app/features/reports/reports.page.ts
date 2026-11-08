import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, UpperCasePipe, formatDate } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';

import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import {
  LineChartComponent,
  ChartPoint,
} from '../../shared/components/line-chart.component';
import {
  ReportDetailDialogComponent,
  ReportDetailData,
  ReportDetailRow,
} from './report-detail-dialog.component';

import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DebtsService } from '../../core/services/debts.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { SubscriptionsService, monthlyEquivalent, yearlyEquivalent } from '../../core/services/subscriptions.service';
import { WalletsService } from '../../core/services/wallets.service';
import { MoneyHeldService, MoneyHeldBalance } from '../../core/services/money-held.service';
import { PeopleService } from '../../core/services/people.service';
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
        <button type="button" class="stat-card" (click)="openHeroDetail('spent')">
          <span class="micro-label">Spent</span>
          <span class="stat-value money-negative">
            {{ monthly().spent | signedMoney: 'out' }}
          </span>
        </button>
        <button type="button" class="stat-card" (click)="openHeroDetail('received')">
          <span class="micro-label">Received</span>
          <span class="stat-value money-positive">
            {{ monthly().received | signedMoney: 'in' }}
          </span>
        </button>
        <button type="button" class="stat-card" (click)="openHeroDetail('saved')">
          <span class="micro-label">Saved</span>
          <span class="stat-value money-savings">
            {{ monthly().saved | signedMoney }}
          </span>
        </button>
        <button type="button" class="stat-card" (click)="openHeroDetail('net')">
          <span class="micro-label">Net Cash</span>
          <span
            class="stat-value"
            [class.money-positive]="monthly().net >= 0"
            [class.money-negative]="monthly().net < 0"
          >
            {{ monthly().net | signedMoney }}
          </span>
        </button>
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
              (click)="openPaymentModeDetail('bank')"
            ></div>
            <div
              class="split-bar-segment cash-seg"
              [style.width.%]="bankVsCashMonthly().cashPct"
              [title]="'Cash: ' + bankVsCashMonthly().cashPct + '%'"
              (click)="openPaymentModeDetail('cash')"
            ></div>
          </div>
          <div class="split-legend">
            <button
              type="button"
              class="legend-item"
              (click)="openPaymentModeDetail('bank')"
            >
              <span class="dot bank-dot"></span>
              <span class="legend-label">Bank Accounts</span>
              <span class="legend-val">{{ bankVsCashMonthly().bankSpent | signedMoney: 'out' }}</span>
              <span class="legend-pct">({{ bankVsCashMonthly().bankPct }}%)</span>
            </button>
            <button
              type="button"
              class="legend-item"
              (click)="openPaymentModeDetail('cash')"
            >
              <span class="dot cash-dot"></span>
              <span class="legend-label">Cash</span>
              <span class="legend-val">{{ bankVsCashMonthly().cashSpent | signedMoney: 'out' }}</span>
              <span class="legend-pct">({{ bankVsCashMonthly().cashPct }}%)</span>
            </button>
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
            <a routerLink="/bank-accounts" class="manage-link">
              <span>Manage</span>
              <lucide-icon name="chevron-right" />
            </a>
          </div>

          <ul class="bank-accounts-list">
            @for (acc of bankAccountRows(); track acc.id; let last = $last) {
              <li
                class="bank-acc-row"
                [class.last]="last"
                (click)="openBankAccountDetail(acc)"
              >
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
          <a routerLink="/bank-accounts" class="btn-primary-sm">
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
          (pointClick)="openTrendDetail($event)"
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
            <li class="cat-row" [class.last]="last" (click)="openSavingsCategoryDetail(c)">
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
            <li class="cat-row" [class.last]="last" (click)="openCategoryDetail(c)">
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
            <li class="day-row" [class.last]="last" (click)="openDayDetail(d)">
              <div class="day-label">{{ d.date | date: 'EEE, MMM d' }}</div>
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
      <button type="button" class="ob-card" (click)="openDebtDetail('they_owe')">
        <span class="micro-label">They owe you</span>
        <span class="ob-value money-positive">
          {{ theyOweTotal() | signedMoney: 'in' }}
        </span>
        <span class="ob-hint">Money you're waiting on</span>
      </button>
      <button type="button" class="ob-card" (click)="openDebtDetail('i_owe')">
        <span class="micro-label">You owe</span>
        <span class="ob-value money-negative">
          {{ youOweTotal() | signedMoney: 'out' }}
        </span>
        <span class="ob-hint">Money you need to pay back</span>
      </button>
    </section>

    <!-- Subscriptions, wallets & money held -->
    @if (hasHoldings()) {
      <div class="section-head">
        <h2>Recurring &amp; holdings</h2>
        <span class="section-hint">Right now</span>
      </div>
      @if (hasGridCards()) {
        <section class="outstanding-grid">
          @if (activeSubscriptions().length > 0) {
            <button type="button" class="ob-card" (click)="openSubscriptionsDetail()">
              <span class="micro-label">Monthly recurring</span>
              <span class="ob-value">{{ subscriptionMonthly() | signedMoney }}</span>
              <span class="ob-hint">
                {{ activeSubscriptions().length }} active · {{ subscriptionYearly() | signedMoney }}/yr
              </span>
            </button>
          }
          @if (renewalsThisMonth().count > 0) {
            <button type="button" class="ob-card" (click)="openRenewalsDetail()">
              <span class="micro-label">Renewed this month</span>
              <span class="ob-value money-negative">
                {{ renewalsThisMonth().amount | signedMoney: 'out' }}
              </span>
              <span class="ob-hint">
                {{ renewalsThisMonth().count }} payment{{ renewalsThisMonth().count === 1 ? '' : 's' }}
                · {{ monthDate() | date: 'MMM y' }}
              </span>
            </button>
          }
          @if (wallets().length > 0) {
            <button type="button" class="ob-card" (click)="openWalletsDetail()">
              <span class="micro-label">Wallet balance</span>
              <span class="ob-value">{{ walletTotal() | signedMoney }}</span>
              <span class="ob-hint">{{ walletHint() }}</span>
            </button>
          }
        </section>
      }

      @if (moneyHeldPeople() > 0) {
        <section class="held-card app-card">
          <div class="held-card-head">
            <div class="held-title-wrap">
              <div class="held-badge"><lucide-icon name="wallet" /></div>
              <div>
                <div class="section-kicker">Money held</div>
                <h2>For other people</h2>
              </div>
            </div>
            <a routerLink="/money-held" class="btn-primary-sm">
              <span>Manage</span>
              <lucide-icon name="chevron-right" />
            </a>
          </div>

          <div class="held-summary" (click)="openMoneyHeldDetail()">
            <div>
              <div class="micro-label">Total held</div>
              <div class="held-total">{{ moneyHeldTotal() | signedMoney }}</div>
            </div>
            <div class="held-people-count">
              <strong>{{ moneyHeldPeople() }}</strong>
              <span>{{ moneyHeldPeople() === 1 ? 'person' : 'people' }}</span>
            </div>
          </div>

          <ul class="held-people-list">
            @for (person of moneyHeldBalances(); track person.id) {
              <li class="held-person-row" (click)="openHeldPersonDetail(person)">
                <span class="held-person-name">{{ person.name }}</span>
                <span class="held-person-balance" [class.settled]="person.outstanding <= 0">
                  {{ person.outstanding | signedMoney }}
                </span>
              </li>
            }
          </ul>
        </section>
      }
    }
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
        border: 0;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        border-radius: var(--app-radius-md);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
        transition: background .15s ease, transform .1s ease;

        &:hover { background: var(--app-hairline); }
        &:active { transform: scale(0.98); }
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
        cursor: pointer;
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
        font-family: inherit;
        color: inherit;
        border: 0;
        background: transparent;
        cursor: pointer;
        padding: 4px;
        margin: -4px;
        border-radius: 8px;
        transition: background .15s ease;

        &:hover { background: var(--app-canvas); }
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
        cursor: pointer;
        transition: background .15s ease;

        &:hover { background: var(--app-canvas); }

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
        cursor: pointer;
        transition: background .15s ease;

        &:hover { background: var(--app-canvas); }
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
        cursor: pointer;
        transition: background .15s ease;

        &:hover { background: var(--app-canvas); }
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
        border: 0;
        font: inherit;
        color: inherit;
        text-align: left;
        width: 100%;
        cursor: pointer;
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-md);
        padding: 14px 16px;
        text-decoration: none;
        min-width: 0;
        transition: transform .1s ease;

        &:active { transform: scale(0.98); }
      }
      .ob-card > span { display: block; }
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

      /* ---------- Money held ------------------------------------------- */
      .held-card {
        margin-bottom: 18px;
        padding: 16px 20px;
      }
      .held-card-head, .held-title-wrap, .held-summary {
        display: flex;
        align-items: center;
      }
      .held-card-head, .held-summary { justify-content: space-between; gap: 12px; }
      .held-title-wrap { gap: 10px; min-width: 0; }
      .held-badge {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 11px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .held-badge lucide-icon { width: 19px; height: 19px; }
      .section-kicker {
        color: var(--app-ink-muted);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .held-card h2 { margin: 1px 0 0; color: var(--app-ink); font-size: 15px; font-weight: 600; }
      .held-summary { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--app-hairline); border-bottom: 1px solid var(--app-hairline); cursor: pointer; transition: opacity .15s ease; }
      .held-summary:hover { opacity: .75; }
      .held-total { margin-top: 2px; color: var(--app-ink); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .held-people-count { display: flex; flex-direction: column; align-items: flex-end; color: var(--app-ink-muted); font-size: 11px; }
      .held-people-count strong { color: var(--app-ink); font-size: 18px; }
      .held-people-list { list-style: none; margin: 0; padding: 0; }
      .held-person-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--app-hairline); cursor: pointer; transition: opacity .15s ease; }
      .held-person-row:hover { opacity: .75; }
      .held-person-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .held-person-name { min-width: 0; overflow: hidden; color: var(--app-ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
      .held-person-balance { color: var(--app-positive); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .held-person-balance.settled { color: var(--app-ink-muted); }

      /* Clip row hover backgrounds to the card's rounded corners */
      .app-card-tight { overflow: hidden; }

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
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly walletsService = inject(WalletsService);
  private readonly moneyHeldService = inject(MoneyHeldService);
  private readonly peopleService = inject(PeopleService);
  private readonly dialog = inject(MatDialog);

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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
      if (t.direction !== 'out' || !t.occurred_on || !t.occurred_on.startsWith(prefix)) continue;
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      if (isSavingsCategory(cat)) continue;
       const key = t.source === 'wallet_spend'
         ? '__wallet_spending__'
         : (t.category_id ?? '__uncategorized__');
      const amt = Number(t.amount);
      totals.set(key, (totals.get(key) ?? 0) + amt);
      sum += amt;
    }
    if (sum === 0) return [];

    return [...totals.entries()]
      .map(([id, amount]) => {
        const cat = catMap.get(id);
         const name = id === '__wallet_spending__' ? 'Wallet spending' : (cat?.name ?? 'Uncategorized');
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
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
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

  // Subscriptions, wallets & money held — "right now" figures
  readonly wallets = this.walletsService.wallets;
  readonly moneyHeldTotal = this.moneyHeldService.totalHeld;
  readonly moneyHeldPeople = this.moneyHeldService.peopleCount;
  readonly moneyHeldBalances = this.moneyHeldService.balances;

  readonly activeSubscriptions = computed(() =>
    this.subscriptionsService
      .subscriptions()
      .filter((subscription) => this.subscriptionsService.statusFor(subscription) === 'active'),
  );

  readonly subscriptionMonthly = computed(() =>
    this.activeSubscriptions().reduce(
      (total, subscription) => total + monthlyEquivalent(subscription.amount, subscription.billing_cycle),
      0,
    ),
  );

  readonly subscriptionYearly = computed(() =>
    this.activeSubscriptions().reduce(
      (total, subscription) => total + yearlyEquivalent(subscription.amount, subscription.billing_cycle),
      0,
    ),
  );

  readonly renewalsThisMonth = computed(() => {
    const { y, m } = ym(this.monthDate());
    let amount = 0;
    let count = 0;
    for (const payment of this.subscriptionsService.payments()) {
      const [py, pm] = payment.paid_on.split('-').map(Number);
      if (py !== y || pm !== m) continue;
      amount += Number(payment.amount);
      count++;
    }
    return { amount, count };
  });

  readonly walletTotal = computed(() =>
    this.walletsService.wallets().reduce((total, wallet) => total + Number(wallet.balance), 0),
  );

  readonly walletHint = computed(() => {
    const wallets = this.walletsService.wallets();
    const low = wallets.filter((w) => w.minimum_balance > 0 && w.balance <= w.minimum_balance).length;
    const base = `${wallets.length} wallet${wallets.length === 1 ? '' : 's'}`;
    return low > 0 ? `${base} · ${low} low balance` : base;
  });

  readonly hasGridCards = computed(
    () =>
      this.activeSubscriptions().length > 0 ||
      this.renewalsThisMonth().count > 0 ||
      this.wallets().length > 0,
  );

  readonly hasHoldings = computed(
    () => this.hasGridCards() || this.moneyHeldPeople() > 0,
  );

  shiftMonth(delta: number): void {
    const cur = this.monthDate();
    const next = new Date(cur.getFullYear(), cur.getMonth() + delta, 1);
    const now = startOfMonth(new Date());
    if (next > now) return;
    this.monthDate.set(next);
  }

  // -------- drill-down details ----------------------------------------------
  // Every report item opens ReportDetailDialogComponent with the records
  // behind its number. Filters below mirror the matching computed exactly so
  // the dialog total always equals the figure that was tapped.

  private readonly inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

  openHeroDetail(kind: 'spent' | 'received' | 'saved' | 'net'): void {
    const catMap = this.categoryMap();
    const rows: ReportDetailRow[] = [];
    for (const t of this.monthTx()) {
      const isSavings = isSavingsCategory(t.category_id ? catMap.get(t.category_id) : undefined);
      if (kind === 'spent' && (isSavings || t.direction !== 'out')) continue;
      if (kind === 'received' && (isSavings || t.direction !== 'in')) continue;
      if (kind === 'saved' && !isSavings) continue;
      rows.push(this.txRow(t, catMap));
    }

    const totals = this.monthly();
    const conf = {
      spent: { title: 'Spent', total: totals.spent, totalTone: 'out' as const, totalLabel: 'Total spent' },
      received: { title: 'Received', total: totals.received, totalTone: 'in' as const, totalLabel: 'Total received' },
      saved: { title: 'Saved', total: totals.saved, totalTone: null, totalLabel: 'Net saved' },
      net: { title: 'Net Cash', total: totals.net, totalTone: null, totalLabel: 'Net this month' },
    }[kind];

    this.openDetail({
      icon: 'receipt',
      title: conf.title,
      subtitle: this.monthLabel(),
      total: conf.total,
      totalTone: conf.totalTone,
      totalLabel: conf.totalLabel,
      rows,
      emptyText: 'No transactions this month.',
    });
  }

  openPaymentModeDetail(mode: 'bank' | 'cash'): void {
    const catMap = this.categoryMap();
    const rows: ReportDetailRow[] = [];
    for (const t of this.monthTx()) {
      if (t.direction !== 'out') continue;
      if ((t.payment_mode === 'bank' ? 'bank' : 'cash') !== mode) continue;
      rows.push(this.txRow(t, catMap));
    }

    const v = this.bankVsCashMonthly();
    this.openDetail({
      icon: 'wallet',
      title: mode === 'bank' ? 'Bank spend' : 'Cash spend',
      subtitle: this.monthLabel(),
      total: mode === 'bank' ? v.bankSpent : v.cashSpent,
      totalTone: 'out',
      totalLabel: 'Total spent',
      rows,
      emptyText: mode === 'bank' ? 'No bank expenses this month.' : 'No cash expenses this month.',
    });
  }

  openBankAccountDetail(acc: BankReportRow): void {
    const catMap = this.categoryMap();
    const rows: ReportDetailRow[] = [];
    for (const t of this.monthTx()) {
      if (t.direction !== 'out' || t.payment_mode !== 'bank') continue;
      if (t.bank_account_id !== acc.id) continue;
      rows.push(this.txRow(t, catMap));
    }

    this.openDetail({
      icon: 'credit-card',
      title: acc.account_name || acc.bank_name,
      subtitle: `${acc.bank_name} · ${this.monthLabel()}`,
      total: acc.monthlySpend,
      totalTone: 'out',
      totalLabel: 'Monthly spend',
      rows,
      emptyText: 'No expenses on this card this month.',
    });
  }

  openCategoryDetail(row: CategoryRow): void {
    const catMap = this.categoryMap();
    const rows = this.monthExpenseTx()
      .filter((t) => this.categoryKey(t) === row.id)
      .map((t) => this.txRow(t, catMap));

    this.openDetail({
      icon: row.icon,
      iconColor: row.color,
      title: row.name,
      subtitle: `${this.monthLabel()} · expenses`,
      total: row.amount,
      totalTone: 'out',
      totalLabel: 'Total spent',
      rows,
      emptyText: 'No expenses in this category.',
    });
  }

  openSavingsCategoryDetail(row: CategoryRow): void {
    const catMap = this.categoryMap();
    const rows = this.monthTx()
      .filter((t) => isSavingsCategory(t.category_id ? catMap.get(t.category_id) : undefined))
      .filter((t) => (t.category_id ?? '__savings__') === row.id)
      .map((t) => this.txRow(t, catMap));

    this.openDetail({
      icon: row.icon,
      iconColor: row.color,
      title: row.name,
      subtitle: `${this.monthLabel()} · savings`,
      total: row.amount,
      totalTone: null,
      totalLabel: 'Total saved',
      rows,
      emptyText: 'No savings in this category.',
    });
  }

  openDayDetail(day: DayRow): void {
    const catMap = this.categoryMap();
    const rows = this.monthExpenseTx()
      .filter((t) => t.occurred_on === day.date)
      .map((t) => this.txRow(t, catMap));

    this.openDetail({
      icon: 'calendar',
      title: formatDate(day.date, 'EEE, MMM d', 'en-US'),
      subtitle: `${this.monthLabel()} · biggest spending days`,
      total: day.amount,
      totalTone: 'out',
      totalLabel: 'Total spent',
      rows,
      emptyText: 'No expenses on this day.',
    });
  }

  openDebtDetail(direction: 'they_owe' | 'i_owe'): void {
    const people = this.peopleService.people();
    const theyOwe = direction === 'they_owe';
    const rows: ReportDetailRow[] = this.debtsService
      .openDebts()
      .filter((d) => d.direction === direction)
      .map((d) => ({
        id: d.id,
        title: people.find((p) => p.id === d.person_id)?.name ?? 'Unknown person',
        date: d.opened_on,
        meta: d.reason ?? undefined,
        amount: Number(d.outstanding),
        tone: theyOwe ? 'in' : 'out',
      }));

    this.openDetail({
      icon: 'handshake',
      title: theyOwe ? 'They owe you' : 'You owe',
      subtitle: 'Outstanding balances',
      total: theyOwe ? this.theyOweTotal() : this.youOweTotal(),
      totalTone: theyOwe ? 'in' : 'out',
      totalLabel: 'Outstanding',
      rows,
      emptyText: 'No outstanding balances.',
    });
  }

  openSubscriptionsDetail(): void {
    const rows: ReportDetailRow[] = this.activeSubscriptions()
      .map((s) => ({
        id: s.id,
        title: s.name,
        meta:
          `${capitalize(s.billing_cycle)}` +
          (s.next_renewal_date
            ? ` · renews ${formatDate(s.next_renewal_date, 'MMM d, y', 'en-US')}`
            : ''),
        amount: monthlyEquivalent(s.amount, s.billing_cycle),
        tone: null,
      }))
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

    this.openDetail({
      icon: 'repeat',
      title: 'Monthly recurring',
      subtitle: 'Active subscriptions',
      total: this.subscriptionMonthly(),
      totalTone: null,
      totalLabel: 'Per month',
      rows,
      emptyText: 'No active subscriptions.',
    });
  }

  openRenewalsDetail(): void {
    const prefix = this.monthPrefix();
    const subs = this.subscriptionsService.subscriptions();
    const rows: ReportDetailRow[] = [];
    for (const p of this.subscriptionsService.payments()) {
      if (!p.paid_on.startsWith(prefix)) continue;
      const sub = subs.find((s) => s.id === p.subscription_id);
      rows.push({
        id: p.id,
        title: sub?.name ?? 'Renewal',
        date: p.paid_on,
        meta: p.notes ?? undefined,
        amount: Number(p.amount),
        tone: 'out',
      });
    }

    this.openDetail({
      icon: 'refresh-cw',
      title: 'Renewed this month',
      subtitle: this.monthLabel(),
      total: this.renewalsThisMonth().amount,
      totalTone: 'out',
      totalLabel: 'Total paid',
      rows,
      emptyText: 'No renewals this month.',
    });
  }

  openWalletsDetail(): void {
    const rows: ReportDetailRow[] = this.wallets().map((w) => ({
      id: w.id,
      title: w.name,
      meta:
        w.minimum_balance > 0 && Number(w.balance) <= w.minimum_balance
          ? 'Low balance'
          : undefined,
      amount: Number(w.balance),
      tone: null,
    }));

    this.openDetail({
      icon: 'wallet',
      title: 'Wallet balance',
      subtitle: this.walletHint(),
      total: this.walletTotal(),
      totalTone: null,
      totalLabel: 'Total balance',
      rows,
      emptyText: 'No wallets yet.',
    });
  }

  openMoneyHeldDetail(): void {
    const rows: ReportDetailRow[] = this.moneyHeldBalances().map((p) => ({
      id: p.id,
      title: p.name,
      meta: `Received ${this.inr.format(p.received)} · Returned ${this.inr.format(p.returned)}`,
      amount: p.outstanding,
      tone: p.outstanding > 0 ? 'in' : null,
    }));

    this.openDetail({
      icon: 'wallet',
      title: 'Money held',
      subtitle: 'For other people',
      total: this.moneyHeldTotal(),
      totalTone: null,
      totalLabel: 'Total held',
      rows,
      emptyText: 'No money held for anyone.',
    });
  }

  openHeldPersonDetail(person: MoneyHeldBalance): void {
    const rows: ReportDetailRow[] = person.records.map((r) => ({
      id: r.id,
      title: r.direction === 'received' ? 'Received' : 'Returned',
      date: r.occurred_on,
      meta: r.notes ?? undefined,
      amount: Number(r.amount),
      tone: r.direction === 'received' ? 'in' : 'out',
    }));

    this.openDetail({
      icon: 'wallet',
      title: person.name,
      subtitle: 'Money held',
      total: person.outstanding,
      totalTone: person.outstanding > 0 ? 'in' : null,
      totalLabel: 'Outstanding',
      rows,
      emptyText: 'No records yet.',
    });
  }

  openTrendDetail(index: number): void {
    const point = this.trend()[index];
    if (!point) return;

    const anchor = this.monthDate();
    const month = new Date(anchor.getFullYear(), anchor.getMonth() - (11 - index), 1);
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const catMap = this.categoryMap();
    const rows: ReportDetailRow[] = [];
    for (const t of this.txService.transactions()) {
      if (t.source === 'transfer' || t.source === 'wallet_recharge') continue;
      if (t.direction !== 'out') continue;
      if (t.category_id && catMap.get(t.category_id)?.kind === 'savings') continue;
      if (!t.occurred_on.startsWith(prefix)) continue;
      rows.push(this.txRow(t, catMap));
    }

    this.openDetail({
      icon: 'trending-up',
      title: `Expenses · ${formatDate(month, 'MMM y', 'en-US')}`,
      subtitle: '12-month trend',
      total: point.value,
      totalTone: 'out',
      totalLabel: 'Total spent',
      rows,
      emptyText: 'No expenses this month.',
    });
  }

  // -------- helpers ----------------------------------------------------------

  private monthPrefix(): string {
    const { y, m } = ym(this.monthDate());
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  private monthLabel(): string {
    return formatDate(this.monthDate(), 'MMMM y', 'en-US');
  }

  /** All non-transfer transactions of the selected month (mirrors monthly()). */
  private monthTx(): Transaction[] {
    const prefix = this.monthPrefix();
    return this.txService.transactions().filter(
      (t) =>
        t.source !== 'transfer' &&
        t.source !== 'wallet_recharge' &&
        t.occurred_on.startsWith(prefix),
    );
  }

  /** Outgoing, non-savings month expenses (mirrors categoryRows/topDays). */
  private monthExpenseTx(): Transaction[] {
    const catMap = this.categoryMap();
    return this.monthTx().filter(
      (t) =>
        t.direction === 'out' &&
        !isSavingsCategory(t.category_id ? catMap.get(t.category_id) : undefined),
    );
  }

  /** Grouping key used by categoryRows(). */
  private categoryKey(t: Transaction): string {
    return t.source === 'wallet_spend' ? '__wallet_spending__' : t.category_id ?? '__uncategorized__';
  }

  private txRow(t: Transaction, catMap: Map<string, Category>): ReportDetailRow {
    const cat = t.category_id ? catMap.get(t.category_id) : undefined;
    const fallback =
      t.source === 'wallet_spend' ? 'Wallet spending' : cat?.name ?? 'Uncategorized';
    return {
      id: t.id,
      title: t.notes?.trim() || fallback,
      date: t.occurred_on,
      meta: t.payment_mode === 'bank' ? 'Bank' : 'Cash',
      amount: Number(t.amount),
      tone: t.direction === 'in' ? 'in' : 'out',
    };
  }

  private openDetail(data: ReportDetailData): void {
    this.dialog.open(ReportDetailDialogComponent, {
      data,
      width: 'min(520px, calc(100vw - 24px))',
    });
  }
}

// -------- helpers -----------------------------------------------------------

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function ym(d: Date): { y: number; m: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
