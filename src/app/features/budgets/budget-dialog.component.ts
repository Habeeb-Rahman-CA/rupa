import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { Budget } from '../../core/models/domain.models';
import { BudgetsService, BudgetInput } from '../../core/services/budgets.service';
import { CategoriesService } from '../../core/services/categories.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { BUDGET_THRESHOLDS, periodRange, toIsoDate } from '../../shared/utils/budget-utils';
import { parseIsoDateLocal } from '../../shared/utils/date-utils';
import { roundCurrency } from '../../shared/utils/currency-utils';
import { errorText } from '../../shared/utils/error-utils';
import { iconFor } from '../../shared/utils/category-utils';

export interface BudgetDialogData {
  budget?: Budget;
}

type Scope = 'overall' | 'category';

/**
 * Add/edit dialog for a spending limit. The period bounds are derived from
 * the period + start date (weekly/monthly/yearly) or picked directly for
 * custom ranges; `BudgetsService` owns persistence and roll-over.
 */
@Component({
  selector: 'app-budget-dialog',
  standalone: true,
  imports: [
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-icon">
          <lucide-icon [name]="isEdit ? 'pencil' : 'gauge'" />
        </div>
        <div class="header-text">
          <h2 mat-dialog-title>{{ isEdit ? 'Edit Budget' : 'Add Budget' }}</h2>
          <p class="dialog-subtitle">
            Set a spending limit for all expenses or for one category.
          </p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <div class="full field-group">
            <label class="ft-label">Budget type</label>
            <mat-button-toggle-group
              [value]="scope()"
              (change)="scope.set($event.value)"
              aria-label="Budget type"
              hideSingleSelectionIndicator
              class="wide-toggle"
            >
              <mat-button-toggle value="overall">Overall spending</mat-button-toggle>
              <mat-button-toggle value="category">One category</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          @if (scope() === 'category') {
            <div class="full">
              <app-select-field
                label="Category"
                placeholder="Choose an expense category"
                [options]="expenseCategoryOptions()"
                [value]="categoryId()"
                [invalid]="touched() && !categoryId()"
                (valueChange)="categoryId.set($any($event))"
              />
            </div>
          }

          <div class="full">
            <app-text-field
              label="Name"
              placeholder="e.g. Food budget"
              leadIcon="tag"
              [value]="name()"
              (valueChange)="name.set($any($event) ?? '')"
            />
          </div>

          <!-- Full-width so all four periods stay visible on every screen. -->
          <div class="full field-group">
            <label class="ft-label">Period</label>
            <mat-button-toggle-group
              [value]="period()"
              (change)="onPeriodChange($event.value)"
              aria-label="Budget period"
              hideSingleSelectionIndicator
              class="wide-toggle"
            >
              <mat-button-toggle value="weekly">Weekly</mat-button-toggle>
              <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
              <mat-button-toggle value="yearly">Yearly</mat-button-toggle>
              <mat-button-toggle value="custom">Custom</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          <div>
            <app-text-field
              label="Limit"
              placeholder="0.00"
              type="number"
              inputmode="decimal"
              [min]="0"
              [step]="1"
              [value]="amount()"
              [invalid]="touched() && !amountValid()"
              (valueChange)="amount.set(toNumber($event))"
            ><span prefix>₹</span></app-text-field>
          </div>

          <div>
            <app-date-field
              label="Start date"
              [value]="startDate()"
              (valueChange)="startDate.set($event)"
            />
          </div>

          @if (period() === 'custom') {
            <div>
              <app-date-field
                label="End date"
                [value]="endDate()"
                [invalid]="touched() && !endDateValid()"
                (valueChange)="endDate.set($event)"
              />
            </div>
          }

          @if (period() !== 'custom' && previewRange(); as range) {
            <p class="full range-hint">
              Period: {{ range.start | date: 'MMM d' }} – {{ range.end | date: 'MMM d, y' }}
            </p>
          }

          <div class="full field-group">
            <label class="ft-label">Repeat</label>
            <mat-button-toggle-group
              [value]="recurring()"
              (change)="recurring.set($event.value)"
              aria-label="Budget recurrence"
              hideSingleSelectionIndicator
              class="wide-toggle"
            >
              <mat-button-toggle [value]="false">One-time</mat-button-toggle>
              <mat-button-toggle [value]="true">Repeats automatically</mat-button-toggle>
            </mat-button-toggle-group>
            @if (recurring()) {
              <p class="hint">The next period's budget is created for you when this one ends.</p>
            }
          </div>

          <div class="full field-group">
            <label class="ft-label">Notify me when I've spent</label>
            <mat-button-toggle-group
              multiple
              [value]="thresholds()"
              (change)="thresholds.set($event.value)"
              aria-label="Alert thresholds"
              hideMultipleSelectionIndicator
              class="wide-toggle"
            >
              <mat-button-toggle [value]="50">50%</mat-button-toggle>
              <mat-button-toggle [value]="75">75%</mat-button-toggle>
              <mat-button-toggle [value]="90">90%</mat-button-toggle>
              <mat-button-toggle [value]="100">100%</mat-button-toggle>
            </mat-button-toggle-group>
            <p class="hint">Push alerts at these milestones (needs notifications on).</p>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" class="cancel-btn" [disabled]="submitting()" (click)="close()">
          Cancel
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!canSave() || submitting()"
          (click)="save()"
        >
          {{ submitting() ? 'Saving…' : isEdit ? 'Save changes' : 'Add budget' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        max-width: 480px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 4px 16px 14px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .header-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .header-icon lucide-icon { width: 19px; height: 19px; }
      .header-text { min-width: 0; }
      h2 {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
      }
      .dialog-subtitle {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .dialog-content {
        padding: 16px !important;
      }
      .full { grid-column: 1 / -1; }
      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
      }
      /* Same behaviour as the subscription dialog: fill the row, scroll only
         when a group genuinely cannot fit (very narrow phones). */
      .wide-toggle { width: 100%; display: flex; overflow-x: auto; }
      .wide-toggle mat-button-toggle { flex: 1 0 auto; }
      /* Swipe-to-scroll on very narrow phones, without the scrollbar strip
         (same treatment as the categories filter bar). */
      .wide-toggle { scrollbar-width: none; }
      .wide-toggle::-webkit-scrollbar { display: none; }
      .range-hint {
        margin: -4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .hint {
        margin: 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.4;
      }

      .dialog-actions { padding: 0 16px 12px; }
      .dialog-actions button { border-radius: 999px; }
      .cancel-btn { color: var(--app-ink-muted) !important; }

      @media (max-width: 540px) {
        /* minmax(0, …) stops the toggle group's min-content from expanding the
           track, which would otherwise scroll the whole dialog horizontally. */
        .form-grid { grid-template-columns: minmax(0, 1fr); }
        /* Trim toggle padding so four options still fit on a phone.
           !important matches the global rule in styles.scss. */
        .wide-toggle ::ng-deep .mat-button-toggle-label-content {
          padding: 0 10px !important;
          font-size: 13px !important;
        }
      }
    `,
  ],
})
export class BudgetDialogComponent {
  private readonly ref = inject<MatDialogRef<BudgetDialogComponent>>(MatDialogRef);
  private readonly data = inject<BudgetDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly budgetsService = inject(BudgetsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = !!this.data.budget;
  readonly submitting = signal(false);
  readonly touched = signal(false);

  readonly scope = signal<Scope>(
    this.data.budget?.category_id ? 'category' : 'overall',
  );
  readonly categoryId = signal<string | null>(this.data.budget?.category_id ?? null);
  readonly name = signal(this.data.budget?.name ?? '');
  readonly amount = signal<number | null>(
    this.data.budget ? Number(this.data.budget.amount) : null,
  );
  readonly period = signal<Budget['period']>(this.data.budget?.period ?? 'monthly');
  readonly startDate = signal<Date | null>(
    this.data.budget ? parseIsoDateLocal(this.data.budget.start_date) : new Date(),
  );
  readonly endDate = signal<Date | null>(
    this.data.budget ? parseIsoDateLocal(this.data.budget.end_date) : null,
  );
  readonly recurring = signal(this.data.budget?.recurring ?? false);
  readonly thresholds = signal<number[]>(
    this.data.budget ? [...this.data.budget.thresholds] : [...BUDGET_THRESHOLDS],
  );

  readonly expenseCategoryOptions = signal<SelectOption<string>[]>([]);

  constructor() {
    // Expense-kind categories only — savings are not spending.
    this.expenseCategoryOptions.set(
      this.categoriesService
        .categories()
        .filter((c) => c.kind === 'expense')
        .map((c) => ({ label: c.name, value: c.id, icon: iconFor(c.name) })),
    );
  }

  /** Derived period bounds for weekly/monthly/yearly (null until picked). */
  previewRange(): { start: string; end: string } | null {
    const start = this.startDate();
    if (!start) return null;
    if (this.period() === 'custom') {
      const end = this.endDate();
      if (!end) return null;
      return { start: toIsoDate(start), end: toIsoDate(end) };
    }
    return periodRange(this.period(), toIsoDate(start));
  }

  onPeriodChange(period: Budget['period']): void {
    this.period.set(period);
    if (period !== 'custom' && !this.endDate()) {
      const range = this.previewRange();
      if (range) this.endDate.set(parseIsoDateLocal(range.end));
    }
  }

  toNumber(value: string | number | null): number | null {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  amountValid(): boolean {
    const value = this.amount();
    return value !== null && value > 0;
  }

  endDateValid(): boolean {
    if (this.period() !== 'custom') return true;
    const start = this.startDate();
    const end = this.endDate();
    if (!start || !end) return false;
    return toIsoDate(end) >= toIsoDate(start);
  }

  canSave(): boolean {
    if (!this.amountValid()) return false;
    if (!this.startDate() || !this.endDateValid()) return false;
    if (this.scope() === 'category' && !this.categoryId()) return false;
    return true;
  }

  async save(): Promise<void> {
    this.touched.set(true);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);

    try {
      const range = this.previewRange();
      if (!range) throw new Error('Pick a valid date range.');
      const categoryId = this.scope() === 'category' ? this.categoryId() : null;
      const input: BudgetInput = {
        name: this.name().trim() || this.autoName(categoryId),
        category_id: categoryId,
        amount: roundCurrency(Number(this.amount())),
        period: this.period(),
        start_date: range.start,
        end_date: range.end,
        recurring: this.recurring(),
        thresholds: [...BUDGET_THRESHOLDS]
          .filter((t) => this.thresholds().includes(t))
          .sort((a, b) => a - b),
      };

      if (this.isEdit) {
        await this.budgetsService.update(this.data.budget!.id, input);
        this.snack.open('Budget updated.', undefined, { duration: 2000 });
      } else {
        await this.budgetsService.create(input);
        this.snack.open('Budget added.', undefined, { duration: 2000 });
      }
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(
        errorText(error, 'Couldn’t save the budget.'),
        'Dismiss',
        { duration: 4000 },
      );
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }

  private autoName(categoryId: string | null): string {
    if (!categoryId) return 'Overall budget';
    const category = this.categoriesService
      .categories()
      .find((c) => c.id === categoryId);
    return category ? `${category.name} budget` : 'Category budget';
  }
}
