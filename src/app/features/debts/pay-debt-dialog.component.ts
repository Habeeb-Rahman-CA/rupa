import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { DebtsService } from '../../core/services/debts.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { Debt, PaymentMode } from '../../core/models/domain.models';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';

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
    MatButtonToggleModule,
    LucideAngularModule,
    SignedMoneyPipe,
    TextFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">
            @if (data.debt.direction === 'i_owe') {
              Pay {{ data.personName }} back
            } @else {
              {{ data.personName }} paid you
            }
          </h2>
          <p class="dialog-subtitle">Record a settlement transaction for this debt</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <p class="outstanding">
          Outstanding balance: <strong>{{ +data.debt.outstanding | signedMoney }}</strong>
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

        <div class="field-group">
          <label class="ft-label">Payment Mode</label>
          <mat-button-toggle-group
            [value]="paymentMode()"
            (change)="setPaymentMode($event.value)"
            hideSingleSelectionIndicator
            class="payment-mode-toggle"
          >
            <mat-button-toggle value="cash">Cash</mat-button-toggle>
            <mat-button-toggle value="bank">Bank Account</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        @if (paymentMode() === 'bank') {
          @if (bankAccountOptions().length > 0) {
            <app-select-field
              label="Bank Account"
              placeholder="Select Bank Account"
              [options]="bankAccountOptions()"
              [value]="selectedBankAccountId()"
              (valueChange)="selectedBankAccountId.set($any($event))"
            />
          } @else {
            <div class="no-bank-notice">
              <lucide-icon name="alert-circle" />
              <span>No bank accounts added yet.</span>
              <button type="button" class="link-btn" (click)="openBankAccounts()">Add Account</button>
            </div>
          }
        }

        <app-text-field
          label="Note (optional)"
          placeholder="e.g. Paid via UPI"
          [maxlength]="120"
          [value]="notes()"
          (valueChange)="notes.set($any($event) ?? '')"
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
          [disabled]="!canSave() || submitting()"
          class="save-btn"
        >
          {{ submitting() ? 'Saving…' : 'Save Payment' }}
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
        gap: 14px;
        padding-top: 16px !important;
        padding-bottom: 16px !important;
        min-width: 300px;
      }
      .outstanding {
        margin: 0 0 2px;
        font-size: 13px;
        color: var(--app-ink-muted);
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
      .payment-mode-toggle {
        width: 100%;
        display: flex;
      }
      .payment-mode-toggle mat-button-toggle {
        flex: 1;
      }
      .no-bank-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--app-bg-hover);
        border: 1px dashed var(--app-hairline);
        border-radius: var(--app-radius-md);
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .no-bank-notice lucide-icon {
        width: 16px;
        height: 16px;
        color: var(--app-ink-subtle);
        flex: 0 0 auto;
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        margin-left: auto;
        color: var(--app-accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover { text-decoration: underline; }
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
export class PayDebtDialogComponent {
  private readonly ref = inject(MatDialogRef<PayDebtDialogComponent>);
  private readonly debtsService = inject(DebtsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly data = inject<PayDebtDialogData>(MAT_DIALOG_DATA);
  readonly submitting = signal(false);
  readonly amount = signal<number | null>(Number(this.data.debt.outstanding));
  readonly notes = signal('');

  readonly paymentMode = signal<PaymentMode>('cash');
  readonly selectedBankAccountId = signal<string | null>(null);

  readonly bankAccountOptions = computed<SelectOption[]>(() => {
    return this.bankAccountsService.bankAccounts().map((acc) => ({
      value: acc.id,
      label: acc.is_primary ? `${acc.bank_name} (${acc.account_name}) ★` : `${acc.bank_name} (${acc.account_name})`,
      icon: 'landmark',
    }));
  });

  constructor() {
    effect(() => {
      const primary = this.bankAccountsService.primaryAccount();
      const accounts = this.bankAccountsService.bankAccounts();
      if (primary && !this.selectedBankAccountId()) {
        this.selectedBankAccountId.set(primary.id);
      }
      if (accounts.length > 0 && this.paymentMode() === 'cash' && !this.userExplicitlySetCash) {
        this.paymentMode.set('bank');
        if (primary) {
          this.selectedBankAccountId.set(primary.id);
        }
      }
    });
  }

  private userExplicitlySetCash = false;

  setPaymentMode(mode: PaymentMode): void {
    this.userExplicitlySetCash = mode === 'cash';
    this.paymentMode.set(mode);
    if (mode === 'bank' && !this.selectedBankAccountId()) {
      const primary = this.bankAccountsService.primaryAccount();
      if (primary) {
        this.selectedBankAccountId.set(primary.id);
      }
    }
  }

  readonly canSave = computed(() => {
    const a = this.amount();
    if (!a || a <= 0) return false;
    if (this.paymentMode() === 'bank' && this.bankAccountOptions().length > 0 && !this.selectedBankAccountId()) {
      return false;
    }
    return a <= Number(this.data.debt.outstanding) + 0.001;
  });

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const mode = this.paymentMode();
      const bankId = mode === 'bank' ? this.selectedBankAccountId() : null;

      await this.debtsService.addPayment({
        debt_id: this.data.debt.id,
        amount: Number(this.amount()),
        notes: this.notes() || null,
        payment_mode: mode,
        bank_account_id: bankId,
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

  openBankAccounts(): void {
    this.ref.close();
    void this.router.navigate(['/bank-accounts']);
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
