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
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">Add Category</h2>
          <p class="dialog-subtitle">Create a new category for your transactions</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <app-text-field
          label="Category Name"
          placeholder="e.g. Subscriptions, Groceries, Salary"
          leadIcon="tags"
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

      <!-- Actions Footer -->
      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()" class="cancel-btn">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="!name().trim() || submitting()"
          class="save-btn"
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
        max-width: 480px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header */
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0 16px 12px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .dialog-title {
        font-size: 18px !important;
        font-weight: 700 !important;
        color: var(--app-ink) !important;
        margin: 0 !important;
        line-height: 1.2 !important;
        padding: 0 !important;
      }
      .dialog-subtitle {
        font-size: 12px;
        color: var(--app-ink-muted);
        margin: 3px 0 0;
      }

      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 16px !important;
        padding-bottom: 16px !important;
        min-width: 300px;
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ft-label {
        display: block;
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
        padding-top: 12px;
      }
      .save-btn {
        border-radius: var(--app-radius-md) !important;
        font-weight: 600 !important;
      }
      .cancel-btn {
        border-radius: var(--app-radius-md) !important;
        color: var(--app-ink-muted) !important;
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
