import { Component, computed, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { CategoriesService } from '../../core/services/categories.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { Category, isSavingsCategory } from '../../core/models/domain.models';
import { CategoryDialogComponent } from './category-dialog.component';
import { errText } from '../../shared/utils/error-utils';
import { colorFor, iconFor } from '../../shared/utils/category-utils';

@Component({
  selector: 'app-categories-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SwipeableRowComponent,
  ],
  template: `
    <app-page-header
      title="Categories"
      subtitle="Organize your expenses, income, and savings"
    >
      <button
        class="add-btn"
        type="button"
        (click)="openAddDialog()"
        aria-label="Add category"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (categories().length === 0) {
      <app-empty-state
        icon="tags"
        title="Start with a few categories"
        message="Add your own above, or seed the essentials with one tap."
      />
      <div class="seed-wrap">
        <button mat-stroked-button (click)="seed()" [disabled]="submitting()">
          <lucide-icon name="sparkles" />
          Add the essentials
        </button>
      </div>
    } @else {
      <div class="filter-bar">
        <mat-button-toggle-group
          [value]="activeFilter()"
          (change)="activeFilter.set($event.value)"
          hideSingleSelectionIndicator
          class="filter-toggle"
        >
          <mat-button-toggle value="all">All</mat-button-toggle>
          <mat-button-toggle value="savings">Savings</mat-button-toggle>
          <mat-button-toggle value="expense">Expense</mat-button-toggle>
          <mat-button-toggle value="income">Income</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <!-- SAVINGS CATEGORIES -->
      @if (activeFilter() === 'all' || activeFilter() === 'savings') {
        <section class="group">
          <div class="group-head">
            <div class="kind-icon savings">
              <lucide-icon name="piggy-bank" />
            </div>
            <div class="group-title">
              <div class="group-label">Savings</div>
              <div class="group-count">{{ savings().length }} {{ savings().length === 1 ? 'category' : 'categories' }}</div>
            </div>
          </div>
          @if (savings().length > 0) {
            <ul class="list">
              @for (c of savings(); track c.id) {
                <app-swipeable-row (delete)="confirmRemove(c)">
                  <div class="row">
                    <div class="icon-tile" [style.background]="colorFor(c.name)">
                      <lucide-icon [name]="iconFor(c.name)" />
                    </div>
                    <div class="mid">
                      <div class="title">{{ c.name }}</div>
                      <div class="sub kind-tag savings">
                        <lucide-icon name="piggy-bank" /> Savings
                      </div>
                    </div>
                  </div>
                </app-swipeable-row>
              }
            </ul>
          } @else {
            <div class="app-card placeholder">No savings categories yet.</div>
          }
        </section>
      }

      <!-- EXPENSE CATEGORIES -->
      @if (activeFilter() === 'all' || activeFilter() === 'expense') {
        <section class="group">
          <div class="group-head">
            <div class="kind-icon negative">
              <lucide-icon name="arrow-down" />
            </div>
            <div class="group-title">
              <div class="group-label">Expense</div>
              <div class="group-count">{{ expenses().length }} {{ expenses().length === 1 ? 'category' : 'categories' }}</div>
            </div>
          </div>
          @if (expenses().length > 0) {
            <ul class="list">
              @for (c of expenses(); track c.id) {
                <app-swipeable-row (delete)="confirmRemove(c)">
                  <div class="row">
                    <div class="icon-tile" [style.background]="colorFor(c.name)">
                      <lucide-icon [name]="iconFor(c.name)" />
                    </div>
                    <div class="mid">
                      <div class="title">{{ c.name }}</div>
                      <div class="sub kind-tag negative">
                        <lucide-icon name="arrow-down" /> Expense
                      </div>
                    </div>
                  </div>
                </app-swipeable-row>
              }
            </ul>
          } @else {
            <div class="app-card placeholder">No expense categories yet.</div>
          }
        </section>
      }

      <!-- INCOME CATEGORIES -->
      @if (activeFilter() === 'all' || activeFilter() === 'income') {
        <section class="group">
          <div class="group-head">
            <div class="kind-icon positive">
              <lucide-icon name="arrow-up" />
            </div>
            <div class="group-title">
              <div class="group-label">Income</div>
              <div class="group-count">{{ incomes().length }} {{ incomes().length === 1 ? 'category' : 'categories' }}</div>
            </div>
          </div>
          @if (incomes().length > 0) {
            <ul class="list">
              @for (c of incomes(); track c.id) {
                <app-swipeable-row (delete)="confirmRemove(c)">
                  <div class="row">
                    <div class="icon-tile" [style.background]="colorFor(c.name)">
                      <lucide-icon [name]="iconFor(c.name)" />
                    </div>
                    <div class="mid">
                      <div class="title">{{ c.name }}</div>
                      <div class="sub kind-tag positive">
                        <lucide-icon name="arrow-up" /> Income
                      </div>
                    </div>
                  </div>
                </app-swipeable-row>
              }
            </ul>
          } @else {
            <div class="app-card placeholder">No income categories yet.</div>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .filter-bar {
        margin-bottom: 20px;
      }
      .filter-toggle {
        width: 100%;
        display: flex;
      }
      .filter-toggle mat-button-toggle {
        flex: 1;
      }
      .add-card { margin-bottom: 20px; padding: 16px; }
      .add-form {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .name { flex: 1; min-width: 200px; }
      .right {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .group { margin-bottom: 24px; }
      .group-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 4px 10px;
      }
      .kind-icon {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;

        lucide-icon { width: 16px; height: 16px; }
      }
      .kind-icon.negative {
        background: var(--app-negative-soft);
        color: var(--app-negative);
      }
      .kind-icon.positive {
        background: var(--app-positive-soft);
        color: var(--app-positive);
      }
      .kind-icon.savings {
        background: var(--app-savings-soft);
        color: var(--app-savings);
      }
      .group-title { display: flex; flex-direction: column; }
      .group-label {
        font-size: 15px;
        font-weight: 700;
        color: var(--app-ink);
        line-height: 1.1;
      }
      .group-count {
        font-size: 12px;
        color: var(--app-ink-muted);
        margin-top: 2px;
      }

      .sub {
        font-size: 11px;
        margin-top: 3px;
      }
      .kind-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-weight: 600;

        lucide-icon { width: 12px; height: 12px; }
      }
      .kind-tag.negative { color: var(--app-negative); }
      .kind-tag.positive { color: var(--app-positive); }
      .kind-tag.savings { color: var(--app-savings); }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr;
        gap: 12px;
        align-items: center;
        padding: 10px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
      .icon-tile {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .icon-tile lucide-icon {
        width: 22px;
        height: 22px;
      }
      .title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .placeholder {
        color: var(--app-ink-muted);
        font-size: 14px;
        text-align: center;
      }
      .seed-wrap {
        display: flex;
        justify-content: center;
        margin-top: 12px;
      }
    `,
  ],
})
export class CategoriesPage {
  private readonly service = inject(CategoriesService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly activeFilter = signal<'all' | 'savings' | 'expense' | 'income'>('all');

  readonly categories = this.service.categories;
  readonly savings = computed(() =>
    this.categories().filter((c) => isSavingsCategory(c)),
  );
  readonly expenses = computed(() =>
    this.categories().filter((c) => c.kind === 'expense' && !isSavingsCategory(c)),
  );
  readonly incomes = computed(() =>
    this.categories().filter((c) => c.kind === 'income' && !isSavingsCategory(c)),
  );

  readonly submitting = signal(false);

  openAddDialog(): void {
    this.dialog.open(CategoryDialogComponent, {
      width: '420px',
    });
  }

  async confirmRemove(c: Category): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: `Delete "${c.name}"?`,
      message: 'Are you sure you want to delete this category?',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.remove(c.id);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.service.delete(id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t delete — please try again.'), 'Dismiss', { duration: 4000 });
    }
  }

  async seed(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.service.seedDefaults();
      this.snack.open('Common categories added — you’re set.', undefined, { duration: 2500 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t seed — please try again.'), 'Dismiss', { duration: 4000 });
    } finally {
      this.submitting.set(false);
    }
  }

  readonly iconFor = iconFor;
  readonly colorFor = colorFor;
}
