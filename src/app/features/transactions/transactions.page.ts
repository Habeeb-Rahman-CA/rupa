import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { BankAccount, Category, Transaction, isSavingsCategory } from '../../core/models/domain.models';
import { getCategoryColor, getCategoryIcon } from '../../shared/utils/category-utils';
import { errText } from '../../shared/utils/error-utils';
import {
  filterTransactions,
  summarizeTransactions,
  toIsoDate,
} from './transaction-filters';

export interface EnrichedTransaction extends Transaction {
  label: string;
  subText: string;
  icon: string;
  color: string;
  isSavings: boolean;
}

export interface DayGroup {
  date: string;
  items: EnrichedTransaction[];
  dayTotal: number;
}

@Component({
  selector: 'app-transactions-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SwipeableRowComponent,
    SignedMoneyPipe,
    DateFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <app-page-header
      title="Transactions"
      subtitle="Every entry, newest first"
    />

    @if (transactions().length > 0) {
      <div class="filter-toolbar" [class.has-filters]="filtersActive()">
        <button
          type="button"
          class="filter-toggle"
          [attr.aria-expanded]="filtersOpen()"
          (click)="toggleFilters()"
        >
          <lucide-icon name="filter" />
          <span>Filters</span>
          @if (filtersActive()) {
            <span class="active-filter-badge">Active</span>
          }
          <lucide-icon
            class="filter-chevron"
            [class.open]="filtersOpen()"
            name="chevron-down"
          />
        </button>
        @if (filtersActive()) {
          <button type="button" class="clear-filter-btn" (click)="clearFilters()">
            Clear
          </button>
        }
      </div>

      @if (filtersOpen()) {
        <section class="filter-panel app-card">
          <div class="filter-grid">
            <app-select-field
              label="Category"
              placeholder="All categories"
              [options]="categoryOptions()"
              [value]="selectedCategoryId()"
              (valueChange)="selectedCategoryId.set($any($event))"
            />
            <app-date-field
              label="From date"
              placeholder="Any date"
              [value]="fromDate()"
              (valueChange)="fromDate.set($event)"
            />
            <app-date-field
              label="To date"
              placeholder="Any date"
              [value]="toDate()"
              (valueChange)="toDate.set($event)"
            />
          </div>

          @if (invalidDateRange()) {
            <div class="filter-error" role="alert">
              The from date must be on or before the to date.
            </div>
          }
        </section>
      }
    }

    @if (filtersActive()) {
      <section class="filter-summary app-card">
        <div class="summary-stats">
          <div class="summary-stat">
            <span class="summary-label">Spend</span>
            <span class="summary-value money-negative">
              {{ filteredSummary().spend | signedMoney: 'out' }}
            </span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Income</span>
            <span class="summary-value money-positive">
              {{ filteredSummary().income | signedMoney: 'in' }}
            </span>
          </div>
          <div class="summary-stat">
            <span class="summary-label">Savings</span>
            <span class="summary-value money-savings">
              {{ filteredSummary().savings | signedMoney }}
            </span>
          </div>
        </div>
        <div class="summary-detail">
          {{ filteredTransactions().length }} transaction{{ filteredTransactions().length === 1 ? '' : 's' }} shown
        </div>
      </section>
    }

    @if (groups().length === 0) {
      <app-empty-state
        icon="receipt"
        [title]="filtersActive() ? 'No matching transactions' : 'No transactions yet'"
        [message]="filtersActive() ? 'Try changing or clearing your filters.' : 'Tap the + button to add your first one.'"
      />
    } @else {
      @for (g of groups(); track g.date) {
        <section class="day">
          <div class="day-head">
            <span class="day-date">{{ g.date | date: 'EEE, MMM d' : 'UTC' }}</span>
            <span
              class="day-total"
              [class.money-negative]="g.dayTotal < 0"
              [class.money-positive]="g.dayTotal > 0"
            >
              {{ g.dayTotal | signedMoney }}
            </span>
          </div>

          <ul class="tx-list">
            @for (t of g.items; track t.id) {
              <app-swipeable-row (delete)="confirmRemove(t)">
                <div class="tx-row">
                  <div class="tx-icon" [style.background]="t.color">
                    <lucide-icon [name]="t.icon" />
                  </div>
                  <div class="tx-mid">
                    <div class="tx-title">{{ t.label }}</div>
                    @if (t.subText) {
                      <div class="tx-sub">{{ t.subText }}</div>
                    }
                  </div>
                  <div
                    class="tx-amount"
                    [class.money-negative]="t.direction === 'out' && !t.isSavings"
                    [class.money-savings]="t.isSavings"
                    [class.money-positive]="t.direction === 'in' && !t.isSavings"
                  >
                    {{ t.amount | signedMoney: (t.isSavings ? 'out' : t.direction) }}
                  </div>
                </div>
              </app-swipeable-row>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: [
    `
      .day { margin-bottom: 20px; }
      .filter-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 42px;
        margin: 0 0 10px;
        padding: 0 4px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
      }
      .filter-toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 0;
        padding: 7px 9px;
        border-radius: 10px;
        background: transparent;
        color: var(--app-ink-muted);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .filter-toggle:hover,
      .filter-toolbar.has-filters .filter-toggle {
        color: var(--app-accent);
      }
      .filter-toggle > lucide-icon:first-child { width: 16px; height: 16px; }
      .filter-chevron {
        width: 15px;
        height: 15px;
        transition: transform .15s ease;
      }
      .filter-chevron.open { transform: rotate(180deg); }
      .active-filter-badge {
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--app-accent);
        color: #fff;
        font-size: 10px;
        letter-spacing: .02em;
      }
      .clear-filter-btn {
        border: 0;
        padding: 5px 8px;
        border-radius: 8px;
        background: transparent;
        color: var(--app-accent);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .clear-filter-btn:hover { background: var(--app-accent-soft); }
      .filter-panel {
        padding: 12px;
        margin-bottom: 14px;
      }
      .filter-grid {
        display: grid;
        grid-template-columns: minmax(180px, 1.25fr) repeat(2, minmax(150px, 1fr));
        gap: 10px;
      }
      .filter-error {
        margin-top: 10px;
        padding: 9px 12px;
        border-radius: 10px;
        background: var(--app-negative-soft);
        color: var(--app-negative);
        font-size: 12px;
      }
      .filter-summary {
        padding: 12px 14px 10px;
        margin-bottom: 16px;
      }
      .summary-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .summary-stat {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .summary-label {
        color: var(--app-ink-muted);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .summary-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .summary-detail {
        margin-top: 9px;
        padding-top: 8px;
        border-top: 1px solid var(--app-hairline);
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .day-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 4px 8px;
      }
      .day-date {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-ink-muted);
      }
      .day-total {
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .tx-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .tx-row {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
      .tx-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .tx-icon lucide-icon {
        width: 22px;
        height: 22px;
      }
      .tx-title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .tx-sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .tx-amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 720px) {
        .filter-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 360px) {
        .summary-stats {
          gap: 5px;
        }
        .summary-value {
          font-size: 13px;
        }
      }
    `,
  ],
})
export class TransactionsPage {
  private readonly service = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly selectedCategoryId = signal<string | null>(null);
  readonly fromDate = signal<Date | null>(null);
  readonly toDate = signal<Date | null>(null);
  readonly filtersOpen = signal(false);

  readonly categoryMap = computed(() => {
    const map = new Map<string, Category>();
    for (const c of this.categoriesService.categories()) {
      map.set(c.id, c);
    }
    return map;
  });

  readonly bankAccountMap = computed(() => {
    const map = new Map<string, BankAccount>();
    for (const b of this.bankAccountsService.bankAccounts()) {
      map.set(b.id, b);
    }
    return map;
  });

  readonly transactions = this.service.transactions;

  readonly categoryOptions = computed<SelectOption<string>[]>(() => [
    { value: '', label: 'All categories', icon: 'layers-3' },
    ...this.categoriesService.categories()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        value: category.id,
        label: category.name,
        icon: isSavingsCategory(category) ? 'piggy-bank' : getCategoryIcon(category.name),
      })),
  ]);

  readonly filterState = computed(() => ({
    categoryId: this.selectedCategoryId() || null,
    fromDate: toIsoDate(this.fromDate()),
    toDate: toIsoDate(this.toDate()),
  }));

  readonly invalidDateRange = computed(() => {
    const { fromDate, toDate } = this.filterState();
    return !!fromDate && !!toDate && fromDate > toDate;
  });

  readonly filtersActive = computed(() => {
    const filter = this.filterState();
    return !!filter.categoryId || !!filter.fromDate || !!filter.toDate;
  });

  readonly filteredTransactions = computed(() =>
    filterTransactions(this.transactions(), this.filterState()),
  );

  readonly savingsCategoryIds = computed(
    () => new Set(this.categoriesService.categories().filter(isSavingsCategory).map((c) => c.id)),
  );

  readonly filteredSummary = computed(() =>
    summarizeTransactions(this.filteredTransactions(), this.savingsCategoryIds()),
  );

  readonly groups = computed<DayGroup[]>(() => {
    const list = this.filteredTransactions();
    const catMap = this.categoryMap();
    const bankMap = this.bankAccountMap();

    const groupMap = new Map<string, DayGroup>();

    for (const t of list) {
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const isSavings = isSavingsCategory(cat);
      const label = cat?.name ?? (t.direction === 'in' ? 'Income' : 'Expense');

      let bankName = '';
      if (t.payment_mode === 'cash') bankName = 'Cash';
      else if (t.payment_mode === 'bank') {
        const acc = t.bank_account_id ? bankMap.get(t.bank_account_id) : undefined;
        bankName = acc?.bank_name ?? 'Bank';
      }

      const parts: string[] = [];
      if (t.notes) parts.push(t.notes);
      if (bankName) parts.push(bankName);
      const subText = parts.join(' • ');

      const icon = isSavings ? 'piggy-bank' : getCategoryIcon(label);
      const color = isSavings ? '#0ea5e9' : getCategoryColor(label);

      const enriched: EnrichedTransaction = {
        ...t,
        label,
        subText,
        icon,
        color,
        isSavings,
      };

      const key = t.occurred_on;
      let group = groupMap.get(key);
      if (!group) {
        group = { date: key, items: [], dayTotal: 0 };
        groupMap.set(key, group);
      }
      group.items.push(enriched);
      const amt = Number(t.amount);
      group.dayTotal += t.direction === 'in' ? amt : -amt;
    }

    return Array.from(groupMap.values());
  });

  clearFilters(): void {
    this.selectedCategoryId.set(null);
    this.fromDate.set(null);
    this.toDate.set(null);
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  async confirmRemove(t: EnrichedTransaction): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete transaction?',
      message: `Are you sure you want to delete ${t.label} entry of ₹${t.amount}?`,
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.remove(t);
    }
  }

  async remove(t: Transaction): Promise<void> {
    try {
      await this.service.delete(t.id);
      this.snack.open('Deleted.', undefined, { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not delete.'), 'Dismiss', { duration: 4000 });
    }
  }
}
