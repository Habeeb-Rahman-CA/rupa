import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CategoryKind } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { CategoriesService } from '../../core/services/categories.service';

@Component({
  selector: 'app-category-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2 mat-dialog-title class="dialog-title">Add Category</h2>
        <p class="dialog-subtitle">Create a new category for your transactions</p>
      </div>

      <mat-dialog-content class="dialog-content">
        <app-text-field
          label="Category Name"
          placeholder="e.g. Subscriptions, Groceries, Salary"
          [maxlength]="40"
          [value]="name()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="save()"
          [autofocus]="true"
        />

        <div class="field-group">
          <label class="ft-label">Category Type</label>
          <mat-button-toggle-group
            [value]="kind()"
            (change)="kind.set($event.value)"
            hideSingleSelectionIndicator
            class="kind-toggle"
          >
            <mat-button-toggle value="expense">Expense</mat-button-toggle>
            <mat-button-toggle value="income">Income</mat-button-toggle>
            <mat-button-toggle value="savings">Savings</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions class="dialog-actions" align="end">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!name().trim() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Add Category' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
      }
      .dialog-header {
        padding: 16px 24px 8px;
      }
      .dialog-title {
        margin: 0;
        padding: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--app-ink);
      }
      .dialog-subtitle {
        margin: 3px 0 0;
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 24px 20px !important;
        min-width: 320px;
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ft-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
      }
      .kind-toggle {
        width: 100%;
        display: flex;
      }
      .kind-toggle mat-button-toggle {
        flex: 1;
      }
      .dialog-actions {
        padding: 12px 24px 16px;
        gap: 8px;
      }
    `,
  ],
})
export class CategoryDialogComponent {
  private readonly ref = inject(MatDialogRef<CategoryDialogComponent>);
  private readonly categoriesService = inject(CategoriesService);
  private readonly snack = inject(MatSnackBar);

  readonly name = signal('');
  readonly kind = signal<CategoryKind>('expense');
  readonly submitting = signal(false);

  async save(): Promise<void> {
    const val = this.name().trim();
    if (!val || this.submitting()) return;

    this.submitting.set(true);
    try {
      await this.categoriesService.create(val, this.kind());
      this.snack.open('Category added.', undefined, { duration: 2000 });
      this.ref.close({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t add — please try again.'), 'Dismiss', { duration: 4000 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
