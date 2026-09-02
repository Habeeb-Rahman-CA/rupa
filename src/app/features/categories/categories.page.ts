import { Component, computed, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { CategoriesService } from '../../core/services/categories.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { CategoryKind } from '../../core/models/domain.models';

@Component({
  selector: 'app-categories-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatMenuModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    TextFieldComponent,
  ],
  template: `
    <app-page-header title="Categories" subtitle="Organize your money in and out" />

    <section class="add-card app-card">
      <div class="add-form">
        <app-text-field
          class="name"
          label="New category"
          placeholder="e.g. Food"
          [maxlength]="40"
          [value]="name()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="add()"
        />

        <div class="right">
          <mat-button-toggle-group
            [value]="kind()"
            (change)="kind.set($event.value)"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="expense">Expense</mat-button-toggle>
            <mat-button-toggle value="income">Income</mat-button-toggle>
          </mat-button-toggle-group>

          <button
            class="add-btn"
            type="button"
            (click)="add()"
            [disabled]="!name().trim() || submitting()"
            aria-label="Add category"
          >
            <lucide-icon name="plus" />
          </button>
        </div>
      </div>
    </section>

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
          <ul class="list app-card-tight">
            @for (c of expenses(); track c.id; let last = $last) {
              <li class="row" [class.last]="last">
                <div class="icon-tile" [style.background]="colorFor(c.name)">
                  <lucide-icon [name]="iconFor(c.name)" />
                </div>
                <div class="mid">
                  <div class="title">{{ c.name }}</div>
                  <div class="sub kind-tag negative">
                    <lucide-icon name="arrow-down" /> Expense
                  </div>
                </div>
                <button mat-icon-button [matMenuTriggerFor]="menu">
                  <lucide-icon name="more-vertical" />
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="remove(c.id)">
                    <lucide-icon name="trash-2" />
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </li>
            }
          </ul>
        } @else {
          <div class="app-card placeholder">No expense categories yet.</div>
        }
      </section>

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
          <ul class="list app-card-tight">
            @for (c of incomes(); track c.id; let last = $last) {
              <li class="row" [class.last]="last">
                <div class="icon-tile" [style.background]="colorFor(c.name)">
                  <lucide-icon [name]="iconFor(c.name)" />
                </div>
                <div class="mid">
                  <div class="title">{{ c.name }}</div>
                  <div class="sub kind-tag positive">
                    <lucide-icon name="arrow-up" /> Income
                  </div>
                </div>
                <button mat-icon-button [matMenuTriggerFor]="menu2">
                  <lucide-icon name="more-vertical" />
                </button>
                <mat-menu #menu2="matMenu">
                  <button mat-menu-item (click)="remove(c.id)">
                    <lucide-icon name="trash-2" />
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </li>
            }
          </ul>
        } @else {
          <div class="app-card placeholder">No income categories yet.</div>
        }
      </section>
    }
  `,
  styles: [
    `
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
      .list { list-style: none; margin: 0; padding: 0; }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px 6px 10px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .row.last { border-bottom: 0; }
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
  private readonly snack = inject(MatSnackBar);

  readonly categories = this.service.categories;
  readonly expenses = computed(() =>
    this.categories().filter((c) => c.kind === 'expense'),
  );
  readonly incomes = computed(() =>
    this.categories().filter((c) => c.kind === 'income'),
  );

  readonly submitting = signal(false);
  readonly name = signal('');
  readonly kind = signal<CategoryKind>('expense');

  async add(): Promise<void> {
    const val = this.name().trim();
    if (!val || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.service.create(val, this.kind());
      this.name.set('');
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t add — please try again.'), 'Dismiss', { duration: 4000 });
    } finally {
      this.submitting.set(false);
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

  iconFor(n: string): string {
    const key = n.toLowerCase();
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

  colorFor(n: string): string {
    let hash = 0;
    for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }
}

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
