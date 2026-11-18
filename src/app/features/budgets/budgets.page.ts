import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { BudgetDialogComponent } from './budget-dialog.component';
import { Budget, Category } from '../../core/models/domain.models';
import { BudgetRow, BudgetsService } from '../../core/services/budgets.service';
import { CategoriesService } from '../../core/services/categories.service';
import { errorText } from '../../shared/utils/error-utils';
import { colorFor, iconFor } from '../../shared/utils/category-utils';
import { toIsoDate } from '../../shared/utils/budget-utils';

/** First → last day of a calendar month, as local date-only strings. */
function monthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: toIsoDate(new Date(year, month, 1)),
    end: toIsoDate(new Date(year, month + 1, 0)),
  };
}

@Component({
  selector: 'app-budgets-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header title="Budgets" subtitle="Spending limits for you and your categories">
      <button class="add-btn" type="button" (click)="openAdd()" aria-label="Add budget">
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (isLoading() && rows().length === 0) {
      <app-loading-state label="Loading budgets…" />
    } @else if (rows().length === 0) {
      <app-empty-state
        icon="gauge"
        title="No budgets yet"
        message="Set a spending limit overall or for one expense category, then track how much of it you use."
      />
      <div class="empty-action">
        <button mat-flat-button color="primary" type="button" (click)="openAdd()">
          <lucide-icon name="plus" /> Add Budget
        </button>
      </div>
    } @else {
      @if (overview().overCount > 0) {
        <div class="over-banner" role="alert">
          <lucide-icon name="alert-circle" />
          <span>
            {{ overview().overCount }}
            {{ overview().overCount === 1 ? 'budget is' : 'budgets are' }} over the limit.
          </span>
        </div>
      }

      @if (activeRows().length > 0) {
        <section class="app-card budget-card" aria-label="Budget overview">
          <div class="section-heading">
            <div>
              <span class="micro-label">Current budgets</span>
              <h2>Overall usage</h2>
            </div>
            <span class="figure-pct" [attr.data-tone]="overview().tone"
              >{{ overview().percent }}%</span
            >
          </div>

          <div class="overview-figures">
            <span class="overview-spent">{{ overview().spent | signedMoney }}</span>
            <span class="overview-limit">of {{ overview().limit | signedMoney }}</span>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill"
              [attr.data-tone]="overview().tone"
              [style.width.%]="barWidth(overview().percent)"
            ></div>
          </div>

          <p class="overview-foot">
            @if (overview().remaining >= 0) {
              {{ overview().remaining | signedMoney }} left to spend
            } @else {
              <span class="overspend-text">
                <lucide-icon name="alert-circle" />
                Overspent by {{ -overview().remaining | signedMoney }}
              </span>
            }
          </p>
        </section>
      }

      @if (activeRows().length > 0) {
        <section class="app-card budget-card" aria-label="Current budgets">
          <div class="section-heading">
            <div>
              <span class="micro-label">In progress</span>
              <h2>Current budgets</h2>
            </div>
            <lucide-icon name="gauge" />
          </div>

          @for (row of activeRows(); track row.budget.id) {
            <div class="budget-item" [class.over]="row.tone === 'over'">
              <div class="item-head">
                <div
                  class="item-icon"
                  [style.color]="itemIcon(row).color"
                  [style.background]="itemIcon(row).bg"
                >
                  <lucide-icon [name]="itemIcon(row).name" />
                </div>
                <div class="item-title">
                  <span class="item-name">{{ row.budget.name }}</span>
                  <span class="item-meta">
                    {{ row.budget.start_date | date: 'MMM d' }} –
                    {{ row.budget.end_date | date: 'MMM d, y' }}
                    @if (row.budget.recurring) {
                      · repeats
                    }
                  </span>
                </div>
                <div class="item-actions">
                  <button
                    mat-icon-button
                    type="button"
                    class="row-btn"
                    aria-label="Edit budget"
                    (click)="openEdit(row.budget)"
                  >
                    <lucide-icon name="pencil" />
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    class="row-btn danger"
                    aria-label="Delete budget"
                    (click)="confirmDelete(row.budget)"
                  >
                    <lucide-icon name="trash-2" />
                  </button>
                </div>
              </div>

              <div class="item-figures">
                <span class="figure-spent">{{ row.spent | signedMoney }}</span>
                <span class="figure-limit">of {{ row.budget.amount | signedMoney }}</span>
                <span class="figure-pct" [attr.data-tone]="row.tone">{{ row.percent }}%</span>
              </div>

              <div class="progress-track">
                <div
                  class="progress-fill"
                  [attr.data-tone]="row.tone"
                  [style.width.%]="barWidth(row.percent)"
                ></div>
              </div>

              <div class="item-foot">
                @if (row.remaining >= 0) {
                  <span>{{ row.remaining | signedMoney }} left</span>
                } @else {
                  <span class="overspend-text">
                    <lucide-icon name="alert-circle" />
                    Overspent by {{ -row.remaining | signedMoney }}
                  </span>
                }
                @if (row.tone === 'warning') {
                  <span class="warn-text">Getting close to the limit</span>
                }
              </div>
            </div>
          }
        </section>
      }

      @if (upcomingRows().length > 0) {
        <section class="app-card budget-card" aria-label="Upcoming budgets">
          <div class="section-heading">
            <div>
              <span class="micro-label">Starting soon</span>
              <h2>Upcoming</h2>
            </div>
            <lucide-icon name="calendar" />
          </div>

          @for (row of upcomingRows(); track row.budget.id) {
            <div class="budget-item">
              <div class="item-head">
                <div
                  class="item-icon"
                  [style.color]="itemIcon(row).color"
                  [style.background]="itemIcon(row).bg"
                >
                  <lucide-icon [name]="itemIcon(row).name" />
                </div>
                <div class="item-title">
                  <span class="item-name">{{ row.budget.name }}</span>
                  <span class="item-meta">
                    {{ row.budget.start_date | date: 'MMM d' }} –
                    {{ row.budget.end_date | date: 'MMM d, y' }}
                    @if (row.budget.recurring) {
                      · repeats
                    }
                  </span>
                </div>
                <div class="item-actions">
                  <button
                    mat-icon-button
                    type="button"
                    class="row-btn"
                    aria-label="Edit budget"
                    (click)="openEdit(row.budget)"
                  >
                    <lucide-icon name="pencil" />
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    class="row-btn danger"
                    aria-label="Delete budget"
                    (click)="confirmDelete(row.budget)"
                  >
                    <lucide-icon name="trash-2" />
                  </button>
                </div>
              </div>

              <div class="item-figures">
                <span class="figure-spent">{{ row.spent | signedMoney }}</span>
                <span class="figure-limit">of {{ row.budget.amount | signedMoney }}</span>
                <span class="figure-pct" [attr.data-tone]="row.tone">{{ row.percent }}%</span>
              </div>

              <div class="progress-track">
                <div
                  class="progress-fill"
                  [attr.data-tone]="row.tone"
                  [style.width.%]="barWidth(row.percent)"
                ></div>
              </div>

              <div class="item-foot">
                <span>{{ row.remaining | signedMoney }} left</span>
              </div>
            </div>
          }
        </section>
      }

      <!-- Monthly comparison -------------------------------------------- -->
      <section class="app-card budget-card" aria-label="Monthly spending comparison">
        <div class="section-heading">
          <div>
            <span class="micro-label">Comparison</span>
            <h2>Monthly spending</h2>
          </div>
          <lucide-icon name="trending-up" />
        </div>

        @for (month of monthCompare().months; track month.label) {
          <div class="cmp-row">
            <span class="cmp-label">{{ month.label }}</span>
            <div class="cmp-track">
              <div class="cmp-fill" [style.width.%]="month.width"></div>
            </div>
            <span class="cmp-value">{{ month.spent | signedMoney }}</span>
          </div>
        }

        @let delta = monthCompare().delta;
        @if (delta !== null) {
          <p class="cmp-delta" [class.up]="delta > 0" [class.down]="delta < 0">
            {{ delta > 0 ? '+' : '' }}{{ delta }}% vs last month
          </p>
        } @else {
          <p class="cmp-delta">No spending recorded last month.</p>
        }
      </section>

      <!-- History --------------------------------------------------------- -->
      @if (historyRows().length > 0) {
        <section class="app-card budget-card" aria-label="Budget history">
          <div class="section-heading">
            <div>
              <span class="micro-label">Past periods</span>
              <h2>History</h2>
            </div>
            <lucide-icon name="clock" />
          </div>

          @for (row of historyRows(); track row.budget.id) {
            <div class="history-row">
              <div class="history-copy">
                <span class="history-name">{{ row.budget.name }}</span>
                <span class="history-meta">
                  {{ row.budget.start_date | date: 'MMM d' }} –
                  {{ row.budget.end_date | date: 'MMM d, y' }}
                  · {{ row.spent | signedMoney }} of {{ row.budget.amount | signedMoney }}
                </span>
              </div>
              <div class="history-end">
                <span class="figure-pct" [attr.data-tone]="row.tone">{{ row.percent }}%</span>
                <button
                  mat-icon-button
                  type="button"
                  class="row-btn"
                  aria-label="Edit budget"
                  (click)="openEdit(row.budget)"
                >
                  <lucide-icon name="pencil" />
                </button>
                <button
                  mat-icon-button
                  type="button"
                  class="row-btn danger"
                  aria-label="Delete budget"
                  (click)="confirmDelete(row.budget)"
                >
                  <lucide-icon name="trash-2" />
                </button>
              </div>
            </div>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .budget-card + .budget-card {
        margin-top: 16px;
      }

      .over-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 13px;
        margin-bottom: 16px;
        border-radius: 14px;
        background: var(--app-negative-soft);
        color: var(--app-negative);
        font-size: 13px;
        font-weight: 600;
      }
      .over-banner lucide-icon {
        width: 17px;
        height: 17px;
        flex: 0 0 auto;
      }

      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .section-heading h2 {
        margin: 2px 0 0;
        color: var(--app-ink);
        font-size: 15px;
        font-weight: 700;
      }
      .section-heading > lucide-icon {
        color: var(--app-ink-subtle);
      }

      /* ------------------------------------------------------------ overview */
      .overview-figures {
        display: flex;
        align-items: baseline;
        gap: 7px;
        margin-bottom: 12px;
      }
      .overview-spent {
        color: var(--app-ink);
        font-size: 26px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .overview-limit {
        color: var(--app-ink-muted);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .overview-foot {
        margin: 10px 0 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
      }

      /* ------------------------------------------------------- progress bar */
      .progress-track {
        height: 8px;
        border-radius: 999px;
        background: var(--app-input-bg);
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--app-accent);
        transition: width 0.35s ease;
      }
      .progress-fill[data-tone='warning'] {
        background: var(--app-warning, #f59e0b);
      }
      .progress-fill[data-tone='over'] {
        background: var(--app-negative);
      }

      /* -------------------------------------------------------- budget item */
      .budget-item {
        padding: 14px 0;
        border-top: 1px solid var(--app-hairline);
      }
      .section-heading + .budget-item {
        border-top: 0;
        padding-top: 0;
      }
      .budget-item:last-child {
        padding-bottom: 0;
      }

      .item-head {
        display: flex;
        align-items: center;
        gap: 11px;
      }
      .item-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
      }
      .item-icon lucide-icon {
        width: 18px;
        height: 18px;
      }
      .item-title {
        min-width: 0;
        flex: 1 1 auto;
      }
      .item-name {
        display: block;
        color: var(--app-ink);
        font-size: 14px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item-meta {
        display: block;
        margin-top: 2px;
        color: var(--app-ink-muted);
        font-size: 11.5px;
      }
      .item-actions {
        display: flex;
        gap: 2px;
        flex: 0 0 auto;
      }

      .row-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        color: var(--app-ink-subtle);
      }
      .row-btn lucide-icon {
        width: 15px;
        height: 15px;
      }
      .row-btn.danger:hover {
        color: var(--app-negative);
      }

      .item-figures {
        display: flex;
        align-items: baseline;
        gap: 7px;
        margin-top: 12px;
      }
      .figure-spent {
        color: var(--app-ink);
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .figure-limit {
        color: var(--app-ink-muted);
        font-size: 12.5px;
        font-variant-numeric: tabular-nums;
      }
      .figure-pct {
        margin-left: auto;
        padding: 2px 9px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-ink);
        font-size: 11.5px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .figure-pct[data-tone='warning'] {
        background: rgba(245, 158, 11, 0.15);
        color: var(--app-warning-dark, #b45309);
      }
      .figure-pct[data-tone='over'] {
        background: var(--app-negative-soft);
        color: var(--app-negative);
      }

      .budget-item .progress-track {
        margin-top: 10px;
      }

      .item-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
        color: var(--app-ink-muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .overspend-text {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--app-negative);
        font-weight: 600;
      }
      .overspend-text lucide-icon {
        width: 14px;
        height: 14px;
      }
      .warn-text {
        color: #b45309;
        font-weight: 600;
      }

      /* ----------------------------------------------------- monthly compare */
      .cmp-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 0;
      }
      .cmp-label {
        width: 76px;
        flex: 0 0 auto;
        color: var(--app-ink);
        font-size: 12.5px;
        font-weight: 600;
      }
      .cmp-track {
        flex: 1 1 auto;
        height: 8px;
        border-radius: 999px;
        background: var(--app-input-bg);
        overflow: hidden;
      }
      .cmp-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--app-accent);
        transition: width 0.35s ease;
      }
      .cmp-row:last-of-type .cmp-fill {
        background: var(--app-ink-subtle);
      }
      .cmp-value {
        width: 78px;
        flex: 0 0 auto;
        text-align: right;
        color: var(--app-ink);
        font-size: 12.5px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .cmp-delta {
        margin: 10px 0 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        font-weight: 600;
      }
      .cmp-delta.up {
        color: var(--app-negative);
      }
      .cmp-delta.down {
        color: var(--app-positive);
      }

      /* ------------------------------------------------------------- history */
      .history-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 0;
        border-top: 1px solid var(--app-hairline);
      }
      .section-heading + .history-row {
        border-top: 0;
        padding-top: 0;
      }
      .history-row:last-child {
        padding-bottom: 0;
      }
      .history-copy {
        min-width: 0;
        flex: 1 1 auto;
      }
      .history-name {
        display: block;
        color: var(--app-ink);
        font-size: 13.5px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-meta {
        display: block;
        margin-top: 2px;
        color: var(--app-ink-muted);
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-end {
        display: flex;
        align-items: center;
        gap: 3px;
        flex: 0 0 auto;
      }
      .history-end .figure-pct {
        margin-left: 0;
      }

      /* ------------------------------------------------------- narrow screens */
      @media (max-width: 480px) {
        .item-head {
          align-items: flex-start;
        }
        /* Long amounts wrap instead of pushing the % pill off the card. */
        .item-figures {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class BudgetsPage {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly categoriesService = inject(CategoriesService);

  private readonly budgetsService = inject(BudgetsService);

  readonly rows = this.budgetsService.rows;
  readonly activeRows = this.budgetsService.activeRows;
  readonly upcomingRows = this.budgetsService.upcomingRows;
  readonly historyRows = this.budgetsService.historyRows;
  readonly overview = this.budgetsService.overview;
  readonly isLoading = this.budgetsService.isLoading;

  /** Spending this calendar month vs the previous one (same accounting rules). */
  readonly monthCompare = computed(() => {
    const now = new Date();
    const current = monthRange(now.getFullYear(), now.getMonth());
    const previous = monthRange(
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      now.getMonth() === 0 ? 11 : now.getMonth() - 1,
    );

    const spent = this.budgetsService.spentIn(current.start, current.end);
    const prevSpent = this.budgetsService.spentIn(previous.start, previous.end);
    const max = Math.max(spent, prevSpent, 1);
    const delta = prevSpent > 0 ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;

    return {
      months: [
        { label: 'This month', spent, width: (spent / max) * 100 },
        { label: 'Last month', spent: prevSpent, width: (prevSpent / max) * 100 },
      ],
      delta,
    };
  });

  barWidth(percent: number): number {
    return Math.min(Math.max(percent, 0), 100);
  }

  itemIcon(row: BudgetRow): { name: string; color: string; bg: string } {
    const category = this.categoryFor(row.budget);
    if (category) {
      const color = colorFor(category.name);
      return { name: iconFor(category.name), color, bg: `${color}1f` };
    }
    return { name: 'wallet', color: 'var(--app-accent)', bg: 'var(--app-accent-soft)' };
  }

  openAdd(): void {
    this.dialog.open(BudgetDialogComponent, {
      width: 'min(620px, calc(100vw - 24px))',
    });
  }

  openEdit(budget: Budget): void {
    this.dialog.open(BudgetDialogComponent, {
      data: { budget },
      width: 'min(620px, calc(100vw - 24px))',
    });
  }

  async confirmDelete(budget: Budget): Promise<void> {
    const confirmed = await openConfirm(this.dialog, {
      title: `Delete ${budget.name}?`,
      message: 'Its spending and history will be removed. Transactions are not affected.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!confirmed) return;
    try {
      await this.budgetsService.delete(budget.id);
      this.snack.open('Budget deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t delete the budget.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  private categoryFor(budget: Budget): Category | undefined {
    if (!budget.category_id) return undefined;
    return this.categoriesService.categories().find((c) => c.id === budget.category_id);
  }
}
