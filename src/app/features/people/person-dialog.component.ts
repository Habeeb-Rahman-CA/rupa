import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TextFieldComponent } from '../../shared/components/text-field.component';
import { PeopleService } from '../../core/services/people.service';

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
      <div class="dialog-header">
        <h2 mat-dialog-title class="dialog-title">Add Person</h2>
        <p class="dialog-subtitle">Add a friend or family member to your money circle</p>
      </div>

      <mat-dialog-content class="dialog-content">
        <app-text-field
          label="Person Name"
          placeholder="e.g. Ahmed, Sarah, John"
          [maxlength]="60"
          [value]="name()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="save()"
          [autofocus]="true"
        />
      </mat-dialog-content>

      <mat-dialog-actions class="dialog-actions" align="end">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!name().trim() || submitting()"
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
      .dialog-actions {
        padding: 12px 24px 16px;
        gap: 8px;
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

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
