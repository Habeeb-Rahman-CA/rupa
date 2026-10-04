import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TextFieldComponent } from '../../shared/components/text-field.component';
import { PeopleService } from '../../core/services/people.service';
import { errorText } from '../../shared/utils/error-utils';

@Component({
  selector: 'app-person-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">Add Person</h2>
          <p class="dialog-subtitle">Add a friend or family member to your money circle</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <app-text-field
          label="Person Name"
          placeholder="e.g. Ahmed, Sarah, John"
          leadIcon="circle-user"
          [maxlength]="60"
          [value]="name()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="save()"
          [autofocus]="true"
        />
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
          {{ submitting() ? 'Saving…' : 'Add Person' }}
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
export class PersonDialogComponent {
  private readonly ref = inject(MatDialogRef<PersonDialogComponent>);
  private readonly peopleService = inject(PeopleService);
  private readonly snack = inject(MatSnackBar);

  readonly name = signal('');
  readonly submitting = signal(false);

  async save(): Promise<void> {
    const val = this.name().trim();
    if (!val || this.submitting()) return;

    this.submitting.set(true);
    try {
      await this.peopleService.create(val);
      this.snack.open('Person added.', undefined, { duration: 2000 });
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
