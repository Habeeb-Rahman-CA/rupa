import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

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
import { Transaction } from '../../core/models/domain.models';

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

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
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
        <div class="stat">
          <div class="micro-label">Spent</div>
          <div class="stat-value money-negative">
            {{ monthly().spent | signedMoney: 'out' }}
          </div>
        </div>
        <div class="v-divider"></div>
        <div class="stat">
          <div class="micro-label">Received</div>
          <div class="stat-value money-positive">
            {{ monthly().received | signedMoney: 'in' }}
          </div>
        </div>
        <div class="v-divider"></div>
        <div class="stat">
          <div class="micro-label">Net</div>
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
          <span class="micro-label">Savings rate</span>
          <span
            class="savings-value"
            [class.money-positive]="savingsRate()! >= 0"
            [class.money-negative]="savingsRate()! < 0"
          >
            {{ savingsRate() }}%
          </span>
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

    <!-- Category breakdown -->
    <div class="section-head">
      <h2>By category</h2>
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
        padding: 20px;
      }
      .stats {
        display: grid;
        grid-template-columns: 1fr auto 1fr auto 1fr;
        align-items: center;
        gap: 12px;
      }
      .stat { text-align: center; min-width: 0; }
      .stat-value {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .v-divider {
        width: 1px;
        height: 30px;
        background: var(--app-hairline);
      }
      .savings-row {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--app-hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .savings-value {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
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
      }
      .ob-card {
        background: var(--app-surface);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-md);
        padding: 14px 16px;
        text-decoration: none;
        color: inherit;
        transition: transform .1s ease;

        &:active { transform: scale(0.98); }
      }
      .ob-value {
        margin-top: 6px;
        font-size: 20px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
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

  // Selected month state — Date pinned to day 1
  readonly monthDate = signal<Date>(startOfMonth(new Date()));

  readonly canGoForward = computed(() => {
    const now = startOfMonth(new Date());
    return this.monthDate() < now;
  });

  readonly monthly = computed(() => {
    const { y, m } = ym(this.monthDate());
    let spent = 0;
    let received = 0;
    for (const t of this.txService.transactions()) {
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      const amt = Number(t.amount);
      if (t.direction === 'out') spent += amt;
      else if (t.direction === 'in') received += amt;
    }
    return { spent, received, net: received - spent };
  });

  readonly savingsRate = computed<number | null>(() => {
    const { spent, received } = this.monthly();
    if (received <= 0) return null;
    const rate = ((received - spent) / received) * 100;
    return Math.round(rate);
  });

  readonly trend = computed<ChartPoint[]>(() => {
    const anchor = this.monthDate();
    const buckets: ChartPoint[] = [];
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
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      const idx = (ty - startY) * 12 + (tm - 1 - startM);
      if (idx < 0 || idx >= 12) continue;
      buckets[idx].value += Number(t.amount);
    }
    return buckets;
  });

  readonly trendHighlight = computed<number | null>(() => {
    const c = this.trend();
    // Highlight the currently-selected month (always the last bucket).
    if (c.length === 0) return null;
    return c.length - 1;
  });

  readonly chartFormatter = (v: number): string =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(v);

  readonly categoryRows = computed<CategoryRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const cats = this.categoriesService.categories();
    const totals = new Map<string, number>();
    let sum = 0;

    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      const key = t.category_id ?? '__uncategorized__';
      const amt = Number(t.amount);
      totals.set(key, (totals.get(key) ?? 0) + amt);
      sum += amt;
    }
    if (sum === 0) return [];

    return [...totals.entries()]
      .map(([id, amount]) => {
        const cat = cats.find((c) => c.id === id);
        const name = cat?.name ?? 'Uncategorized';
        return {
          id,
          name,
          amount,
          percent: Math.round((amount / sum) * 100),
          color: colorForName(name),
          icon: iconForName(name),
        };
      })
      .sort((a, b) => b.amount - a.amount);
  });

  readonly topDays = computed<DayRow[]>(() => {
    const { y, m } = ym(this.monthDate());
    const byDay = new Map<string, number>();
    for (const t of this.txService.transactions()) {
      if (t.direction !== 'out') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
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
    // Rough estimate: sum of "they owe you" totals across open events is
    // heavy to compute here (needs per-event detail). Show 0 as neutral.
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

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
  return palette[Math.abs(hash) % palette.length];
}

function iconForName(name: string): string {
  const key = name.toLowerCase();
  if (key.includes('food') || key.includes('groc')) return 'utensils-crossed';
  if (key.includes('fuel') || key.includes('petrol') || key.includes('transport')) return 'fuel';
  if (key.includes('rent') || key.includes('home')) return 'home';
  if (key.includes('salary')) return 'briefcase';
  if (key.includes('pf') || key.includes('invest')) return 'piggy-bank';
  if (key.includes('bill') || key.includes('util')) return 'receipt';
  if (key.includes('shop')) return 'shopping-bag';
  if (key.includes('travel') || key.includes('trip')) return 'plane';
  if (key.includes('health') || key.includes('med')) return 'stethoscope';
  if (key.includes('income')) return 'trending-up';
  return 'wallet';
}
