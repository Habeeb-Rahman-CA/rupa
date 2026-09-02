import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DebtsService } from '../../core/services/debts.service';
import { Debt } from '../../core/models/domain.models';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { TextFieldComponent } from '../../shared/components/text-field.component';

export interface PayDebtDialogData {
  debt: Debt;
  personName: string;
}

@Component({
  selector: 'app-pay-debt-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    SignedMoneyPipe,
    TextFieldComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      @if (data.debt.direction === 'i_owe') {
        Pay {{ data.personName }} back
      } @else {
        {{ data.personName }} paid you
      }
    </h2>

    <mat-dialog-content class="content">
      <p class="outstanding">
        Outstanding: <strong>{{ +data.debt.outstanding | signedMoney }}</strong>
      </p>

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [max]="+data.debt.outstanding"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amount.set(toNum($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

      <app-text-field
        label="Note (optional)"
        placeholder="e.g. Paid via UPI"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($any($event) ?? '')"
      />
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        (click)="save()"
        [disabled]="!canSave() || submitting()"
      >
        {{ submitting() ? 'Saving…' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 300px;
      }
      .outstanding {
        margin: 0 0 4px;
        color: var(--app-ink-muted);
      }
    `,
  ],
})
export class PayDebtDialogComponent {
  private readonly ref = inject(MatDialogRef<PayDebtDialogComponent>);
  private readonly debtsService = inject(DebtsService);
  private readonly snack = inject(MatSnackBar);

  readonly data = inject<PayDebtDialogData>(MAT_DIALOG_DATA);
  readonly submitting = signal(false);
  readonly amount = signal<number | null>(Number(this.data.debt.outstanding));
  readonly notes = signal('');

  readonly canSave = computed(() => {
    const a = this.amount();
    if (!a || a <= 0) return false;
    return a <= Number(this.data.debt.outstanding) + 0.001;
  });

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.debtsService.addPayment({
        debt_id: this.data.debt.id,
        amount: Number(this.amount()),
        notes: this.notes() || null,
      });
      this.snack.open('Payment recorded.', undefined, { duration: 2000 });
      this.ref.close({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', { duration: 4000 });
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
