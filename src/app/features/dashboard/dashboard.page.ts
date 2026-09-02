import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';

import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import {
  LineChartComponent,
  ChartPoint,
} from '../../shared/components/line-chart.component';
import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DebtsService } from '../../core/services/debts.service';
import { Transaction } from '../../core/models/domain.models';

interface CategorySpend {
  id: string;
  name: string;
  amount: number;
}

type Range = 'week' | 'month' | 'year';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    SignedMoneyPipe,
    LineChartComponent,
  ],
  template: `
    <!-- HERO -->
    <section class="hero app-card">
      <div class="hero-top">
        <div>
          <div class="micro-label">Total balance</div>
          <div class="hero-amount" [class.money-negative]="balance() < 0">
            {{ balance() | signedMoney }}
          </div>
        </div>
        <mat-button-toggle-group
          [value]="range()"
          (change)="range.set($event.value)"
          hideSingleSelectionIndicator
          class="range-toggle"
        >
          <mat-button-toggle value="week">Week</mat-button-toggle>
          <mat-button-toggle value="month">Month</mat-button-toggle>
          <mat-button-toggle value="year">Year</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (chart().length >= 2) {
        <div class="chart-wrap">
          <app-line-chart
            [points]="chart()"
            [highlight]="chartHighlight()"
            color="var(--app-ink-dark)"
            [formatter]="chartFormatter"
          />
        </div>
      } @else {
        <div class="chart-empty">
          Add a few expenses to see your trend.
        </div>
      }

      <div class="chip-row">
        <div class="stat-chip">
          <div class="chip-icon">
            <lucide-icon name="arrow-up" />
          </div>
          <div>
            <div class="chip-label">Income</div>
            <div class="chip-value money-positive">
              {{ monthly().received | signedMoney: 'in' }}
            </div>
          </div>
        </div>
        <div class="stat-chip negative">
          <div class="chip-icon">
            <lucide-icon name="arrow-down" />
          </div>
          <div>
            <div class="chip-label">Expense</div>
            <div class="chip-value money-negative">
              {{ monthly().spent | signedMoney: 'out' }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- OWED STRIPE -->
    @if (theyOweTotal() > 0 || youOweTotal() > 0) {
      <section class="owed-row">
        <a routerLink="/debts" class="owed-card">
          <div class="micro-label">They owe you</div>
          <div class="owed-value money-positive">{{ theyOweTotal() | signedMoney: 'in' }}</div>
        </a>
        <a routerLink="/debts" class="owed-card">
          <div class="micro-label">You owe</div>
          <div class="owed-value money-negative">{{ youOweTotal() | signedMoney: 'out' }}</div>
        </a>
      </section>
    }

    <!-- SPENDING BY CATEGORY -->
    @if (topCategories().length > 0) {
      <div class="section-head">
        <h2>Spending by category</h2>
        <a routerLink="/reports" class="see-all">See all</a>
      </div>
      <div class="tiles">
        @for (c of topCategories(); track c.id) {
          <div class="tile">
            <div class="tile-icon" [style.background]="tileColor(c.name)">
              <lucide-icon [name]="iconFor(c.name)" />
            </div>
            <div class="tile-name">{{ c.name }}</div>
            <div class="tile-amount money-negative">
              {{ c.amount | signedMoney: 'out' }}
            </div>
          </div>
        }
      </div>
    }

    <!-- RECENT TRANSACTIONS -->
    <div class="section-head">
      <h2>Recent transactions</h2>
      <a routerLink="/transactions" class="see-all">See all</a>
    </div>

    @if (recent().length > 0) {
      <ul class="tx-list app-card-tight">
        @for (t of recent(); track t.id; let last = $last) {
          <li class="tx-row" [class.last]="last">
            <div class="tx-icon" [style.background]="tileColor(txLabel(t))">
              <lucide-icon [name]="iconFor(txLabel(t))" />
            </div>
            <div class="tx-mid">
              <div class="tx-title">{{ txLabel(t) }}</div>
              <div class="tx-sub">
                {{ t.occurred_on | date: 'MMM d' }}
                @if (t.notes) { Â· {{ t.notes }} }
              </div>
            </div>
            <div
              class="tx-amount"
              [class.money-negative]="t.direction === 'out'"
              [class.money-positive]="t.direction === 'in'"
            >
              {{ t.amount | signedMoney: t.direction }}
            </div>
          </li>
        }
      </ul>
    } @else {
      <button class="dashed-tile w-full">
        <lucide-icon name="plus" />
        Add your first transaction
      </button>
    }
  `,
  styles: [
    `
      /* ---------- Hero ------------------------------------------------- */
      .hero {
        padding: 20px;
        border-radius: var(--app-radius-xl);
      }
      .hero-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .hero-amount {
        margin-top: 4px;
        font-size: 32px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--app-ink);
        font-variant-numeric: tabular-nums;
      }
      .hero-amount.money-negative { color: var(--app-negative); }

      .range-toggle ::ng-deep .mat-button-toggle-label-content {
        padding: 0 10px !important;
        line-height: 28px !important;
        font-size: 12px !important;
      }

      .chart-wrap {
        margin-top: 16px;
      }
      .chart-empty {
        margin-top: 16px;
        padding: 24px 0;
        text-align: center;
        color: var(--app-ink-muted);
        font-size: 13px;
      }

      .chip-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 16px;
      }

      /* ---------- Owed row --------------------------------------------- */
      .owed-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 16px;
      }
      .owed-card {
        background: var(--app-surface);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-md);
        padding: 14px 16px;
        text-decoration: none;
        color: inherit;
      }
      .owed-value {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ---------- Section headers -------------------------------------- */
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
      .see-all {
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
      }

      /* ---------- Category tiles --------------------------------------- */
      .tiles {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding-bottom: 4px;
        margin: 0 -20px;
        padding-left: 20px;
        padding-right: 20px;
        scroll-snap-type: x mandatory;
      }
      .tile {
        background: var(--app-surface);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-md);
        padding: 14px;
        min-width: 130px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        scroll-snap-align: start;
      }
      .tile-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .tile-icon lucide-icon { width: 22px; height: 22px; }
      .tile-name {
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .tile-amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ---------- Recent transactions ---------------------------------- */
      .tx-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .tx-row {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .tx-row.last { border-bottom: 0; }
      .tx-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .tx-icon lucide-icon { width: 22px; height: 22px; }
      .tx-title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .tx-sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .tx-amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .w-full { width: 100%; }
    `,
  ],
})
export class DashboardPage {
  private readonly txService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly debtsService = inject(DebtsService);

  readonly balance = this.txService.balance;
  readonly monthly = this.txService.monthly;
  readonly recent = computed(() => this.txService.transactions().slice(0, 6));
  readonly theyOweTotal = this.debtsService.theyOweYouTotal;
  readonly youOweTotal = this.debtsService.youOweTotal;

  readonly range = signal<Range>('month');

  // Chart data based on range.
  readonly chart = computed<ChartPoint[]>(() => {
    const txs = this.txService.transactions();
    switch (this.range()) {
      case 'week':
        return this.bucketDaily(txs, 7);
      case 'month':
        return this.bucketDaily(txs, 30);
      case 'year':
        return this.bucketMonthly(txs, 12);
    }
  });

  // Highlight the peak spending day/month
  readonly chartHighlight = computed<number | null>(() => {
    const c = this.chart();
    if (c.length === 0) return null;
    let max = -Infinity;
    let idx = -1;
    for (let i = 0; i < c.length; i++) {
      if (c[i].value > max) { max = c[i].value; idx = i; }
    }
    return max > 0 ? idx : null;
  });

  readonly chartFormatter = (v: number): string =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(v);

  readonly topCategories = computed<CategorySpend[]>(() => {
    const cats = this.categoriesService.categories();
    const txs = this.txService.transactions();
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const totals = new Map<string, number>();
    for (const t of txs) {
      if (t.direction !== 'out' || !t.category_id) continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      if (ty !== y || tm !== m) continue;
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + Number(t.amount));
    }
    return [...totals.entries()]
      .map(([id, amount]) => ({
        id,
        name: cats.find((c) => c.id === id)?.name ?? 'Other',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  });

  txLabel(t: Transaction): string {
    return this.categoriesService.categories().find((c) => c.id === t.category_id)?.name
      ?? (t.direction === 'in' ? 'Income' : 'Expense');
  }

  iconFor(name: string): string {
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

  tileColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }

  // -------- chart bucketing helpers ----------------------------------------

  private bucketDaily(txs: Transaction[], days: number): ChartPoint[] {
    const buckets: ChartPoint[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({
        label: this.dayLabel(d, days),
        value: 0,
      });
    }

    for (const t of txs) {
      if (t.direction !== 'out') continue;
      const [ty, tm, td] = t.occurred_on.split('-').map(Number);
      const d = new Date(ty, tm - 1, td);
      const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff >= days) continue;
      const idx = days - 1 - diff;
      buckets[idx].value += Number(t.amount);
    }
    return buckets;
  }

  private bucketMonthly(txs: Transaction[], months: number): ChartPoint[] {
    const buckets: ChartPoint[] = [];
    const today = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('en-US', { month: 'short' }),
        value: 0,
      });
    }
    const startY = today.getFullYear();
    const startM = today.getMonth() - (months - 1);
    for (const t of txs) {
      if (t.direction !== 'out') continue;
      const [ty, tm] = t.occurred_on.split('-').map(Number);
      const idx = (ty - startY) * 12 + (tm - 1 - startM);
      if (idx < 0 || idx >= months) continue;
      buckets[idx].value += Number(t.amount);
    }
    return buckets;
  }

  private dayLabel(d: Date, span: number): string {
    if (span <= 7) return d.toLocaleString('en-US', { weekday: 'short' }).slice(0, 1);
    // 30 days: only show every ~5th day label so they don't overlap
    return d.getDate() % 5 === 0 || d.getDate() === 1 ? String(d.getDate()) : '';
  }
}
