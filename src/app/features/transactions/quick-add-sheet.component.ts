import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { LucideAngularModule } from 'lucide-angular';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { Category, TxDirection } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';

const NEW_CATEGORY = '__new__';

@Component({
  selector: 'app-quick-add-sheet',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    LucideAngularModule,
    TextFieldComponent,
  ],
  template: `
    <div class="sheet">
      <header class="sheet-header">
        <h2>Add {{ direction() === 'out' ? 'expense' : 'income' }}</h2>
        <mat-button-toggle-group
          [value]="direction()"
          (change)="setDirection($event.value)"
          hideSingleSelectionIndicator
          class="direction-toggle"
        >
          <mat-button-toggle value="out">Expense</mat-button-toggle>
          <mat-button-toggle value="in">Income</mat-button-toggle>
        </mat-button-toggle-group>
      </header>

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amount.set(toNum($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

      <div>
        <div class="micro-label cat-label">Category</div>
        <mat-chip-listbox
          [ngModel]="selectedCategoryId()"
          (ngModelChange)="selectedCategoryId.set($event)"
          aria-label="Category"
        >
          @for (c of relevantCategories(); track c.id) {
            <mat-chip-option [value]="c.id">{{ c.name }}</mat-chip-option>
          }
          <mat-chip-option [value]="NEW_CATEGORY">
            Other
          </mat-chip-option>
        </mat-chip-listbox>
      </div>

      @if (selectedCategoryId() === NEW_CATEGORY) {
        <app-text-field
          #newCatField
          [label]="'New ' + (direction() === 'out' ? 'expense' : 'income') + ' category'"
          placeholder="e.g. Petrol"
          [maxlength]="40"
          [value]="newCategoryName()"
          (valueChange)="newCategoryName.set($event ? String($event) : '')"
          (enter)="save()"
        />
      }

      <app-text-field
        label="Note (optional)"
        placeholder="A quick reminder for later"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($event ? String($event) : '')"
      />

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet {
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .cat-label { margin-bottom: 8px; }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .direction-toggle {
        transform: scale(0.9);
        transform-origin: right center;
      }
    `,
  ],
})
export class QuickAddSheetComponent {
  protected readonly NEW_CATEGORY = NEW_CATEGORY;
  protected readonly String = String;

  private readonly ref = inject(MatBottomSheetRef<QuickAddSheetComponent>);
  private readonly categoriesService = inject(CategoriesService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly snack = inject(MatSnackBar);

  readonly direction = signal<TxDirection>('out');
  readonly submitting = signal(false);
  readonly amount = signal<number | null>(null);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly newCategoryName = signal('');
  readonly notes = signal('');

  readonly relevantCategories = computed<Category[]>(() => {
    const kind = this.direction() === 'out' ? 'expense' : 'income';
    return this.categoriesService.categories().filter((c) => c.kind === kind);
  });

  readonly canSave = computed(() => {
    const amt = this.amount();
    if (!amt || amt <= 0) return false;
    if (this.selectedCategoryId() === NEW_CATEGORY && !this.newCategoryName().trim()) {
      return false;
    }
    return true;
  });

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  setDirection(next: TxDirection): void {
    if (this.direction() === next) return;
    this.direction.set(next);
    this.selectedCategoryId.set(null);
    this.newCategoryName.set('');
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      let categoryId: string | null = null;
      if (this.selectedCategoryId() === NEW_CATEGORY) {
        const kind = this.direction() === 'out' ? 'expense' : 'income';
        const created = await this.categoriesService.create(
          this.newCategoryName(),
          kind,
        );
        categoryId = created?.id ?? null;
      } else {
        categoryId = this.selectedCategoryId();
      }

      await this.transactionsService.create({
        amount: Number(this.amount()),
        direction: this.direction(),
        category_id: categoryId,
        notes: this.notes(),
      });

      this.snack.open(
        this.direction() === 'out' ? 'Expense recorded.' : 'Income recorded.',
        undefined,
        { duration: 2000 },
      );
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
