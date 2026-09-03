import { Component, computed, inject, signal } from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { TransactionsService } from '../../core/services/transactions.service';
import { TextFieldComponent } from '../../shared/components/text-field.component';

@Component({
  selector: 'app-set-opening-balance-sheet',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    TextFieldComponent,
  ],
  template: `
    <div class="sheet">
      <header class="sheet-header">
        <div>
          <h2>Set starting balance</h2>
          <p class="subtitle">Set your starting money without distorting your monthly income and expense totals.</p>
        </div>
      </header>

      <app-text-field
        label="Starting Balance"
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

      <mat-button-toggle-group
        [value]="direction()"
        (change)="direction.set($event.value)"
        hideSingleSelectionIndicator
        class="direction-toggle"
      >
        <mat-button-toggle value="in">Cash in bank/hand</mat-button-toggle>
        <mat-button-toggle value="out">Overdraft / Debt</mat-button-toggle>
      </mat-button-toggle-group>

      <div class="hint">
        This initial balance is recorded as an opening entry dated in the past so it only affects your <strong>Total Balance</strong> and will <strong>not</strong> count towards your monthly Income or Expense statistics.
      </div>

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Save Balance' }}
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
      .sheet-header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .direction-toggle {
        width: 100%;
        display: flex;
      }
      .direction-toggle mat-button-toggle {
        flex: 1;
      }
      .hint {
        font-size: 12px;
        color: var(--app-ink-muted);
        line-height: 1.35;
        background: var(--app-bg-hover);
        padding: 10px 12px;
        border-radius: 8px;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
    `,
  ],
})
export class SetOpeningBalanceSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<SetOpeningBalanceSheetComponent>);
  private readonly txService = inject(TransactionsService);
  private readonly snack = inject(MatSnackBar);

  readonly currentOpening = this.txService.openingBalance();
  readonly amount = signal<number | null>(
    this.currentOpening !== null ? Math.abs(this.currentOpening) : null,
  );
  readonly direction = signal<'in' | 'out'>(
    this.currentOpening !== null && this.currentOpening < 0 ? 'out' : 'in',
  );
  readonly submitting = signal(false);

  readonly canSave = computed(() => {
    const amt = this.amount();
    return amt !== null && amt >= 0;
  });

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const amt = Number(this.amount() ?? 0);
      const signedAmt = this.direction() === 'out' ? -amt : amt;
      await this.txService.setOpeningBalance(signedAmt);
      this.snack.open('Starting balance updated.', undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Could not set starting balance.'), 'Dismiss', { duration: 4000 });
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
