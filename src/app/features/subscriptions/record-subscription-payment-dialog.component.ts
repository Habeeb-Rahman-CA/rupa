import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { Subscription, Transaction } from '../../core/models/domain.models';
import { SubscriptionsService } from '../../core/services/subscriptions.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';

export interface RecordSubscriptionPaymentDialogData {
  subscription: Subscription;
}

type PaymentEntryMode = 'existing' | 'new';

@Component({
  selector: 'app-record-subscription-payment-dialog',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-icon"><lucide-icon name="receipt" /></div>
        <div>
          <h2 mat-dialog-title>Record {{ data.subscription.name }} payment</h2>
          <p class="dialog-subtitle">Renewal dates are reminders only. This action records the actual payment.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="renewal-summary">
          <div>
            <span class="micro-label">Renewal due</span>
            <strong>{{ data.subscription.next_renewal_date | date: 'MMM d, y' : 'UTC' }}</strong>
          </div>
          <div>
            <span class="micro-label">Plan amount</span>
            <strong>₹{{ data.subscription.amount | number:'1.2-2' }}</strong>
          </div>
        </div>

        <div class="mode-group">
          <label class="ft-label">How should this payment be recorded?</label>
          <mat-button-toggle-group
            [value]="entryMode()"
            (change)="setEntryMode($event.value)"
            hideSingleSelectionIndicator
            class="mode-toggle"
          >
            <mat-button-toggle value="existing">Link expense</mat-button-toggle>
            <mat-button-toggle value="new">Create expense</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        @if (entryMode() === 'existing') {
          @if (transactionOptions().length > 0) {
            <app-select-field
              label="Existing expense transaction"
              placeholder="Choose an expense to link"
              [options]="transactionOptions()"
              [value]="selectedTransactionId()"
              (valueChange)="selectTransaction($any($event))"
            />
            <div class="hint">Linking keeps this payment out of duplicate accounting.</div>
          } @else {
            <div class="notice">
              <lucide-icon name="info" />
              <span>No unlinked expense transactions match this amount. Create the expense below or add it first.</span>
            </div>
          }
        } @else {
          <app-text-field
            label="Payment amount"
            placeholder="0.00"
            type="number"
            inputmode="decimal"
            [min]="0"
            [step]="0.01"
            [value]="amount()"
            (valueChange)="amount.set(toNumber($event))"
          ><span prefix>₹</span></app-text-field>

          <div class="mode-group">
            <label class="ft-label">Payment mode</label>
            <mat-button-toggle-group
              [value]="paymentMode()"
              (change)="setPaymentMode($event.value)"
              hideSingleSelectionIndicator
              class="mode-toggle"
            >
              <mat-button-toggle value="cash">Cash</mat-button-toggle>
              <mat-button-toggle value="bank">Bank account</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          @if (paymentMode() === 'bank') {
            @if (accountOptions().length > 0) {
              <app-select-field
                label="Bank account"
                placeholder="Choose an account"
                [options]="accountOptions()"
                [value]="bankAccountId()"
                (valueChange)="bankAccountId.set($any($event))"
              />
            } @else {
              <div class="notice"><lucide-icon name="info" /><span>Add a bank account first, or choose cash.</span></div>
            }
          }
        }

        <app-date-field
          label="Paid on"
          placeholder="Payment date"
          [value]="paidOn()"
          (valueChange)="paidOn.set($event)"
        />

        <app-text-field
          label="Note (optional)"
          placeholder="e.g. Paid after renewal reminder"
          [maxlength]="160"
          [value]="notes()"
          (valueChange)="notes.set($any($event) ?? '')"
        />
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!canSave() || submitting()">
          {{ submitting() ? 'Saving…' : 'Record payment' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container { max-width: 520px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .header-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 13px; background: var(--app-positive-soft); color: var(--app-positive); }
      .header-icon lucide-icon { width: 20px; height: 20px; }
      .dialog-title { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { display: flex; flex-direction: column; gap: 14px; max-height: 72vh; padding: 18px 16px !important; }
      .renewal-summary { display: flex; justify-content: space-between; gap: 16px; padding: 12px 14px; border-radius: 14px; background: var(--app-accent-soft); }
      .renewal-summary div { display: flex; flex-direction: column; gap: 3px; }
      .renewal-summary div:last-child { text-align: right; }
      .renewal-summary strong { font-size: 14px; font-variant-numeric: tabular-nums; }
      .micro-label { color: var(--app-ink-muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .mode-group { display: flex; flex-direction: column; gap: 6px; }
      .ft-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .mode-toggle { display: flex; width: 100%; }
      .mode-toggle mat-button-toggle { flex: 1; }
      .notice, .hint { color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .notice { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--app-accent-soft); }
      .notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .hint { margin-top: -7px; }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
    `,
  ],
})
export class RecordSubscriptionPaymentDialogComponent {
  readonly data = inject<RecordSubscriptionPaymentDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RecordSubscriptionPaymentDialogComponent>);
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);

  readonly submitting = signal(false);
  readonly entryMode = signal<PaymentEntryMode>('existing');
  readonly selectedTransactionId = signal<string | null>(null);
  readonly amount = signal<number | null>(this.data.subscription.amount);
  readonly paidOn = signal<Date | null>(new Date());
  readonly paymentMode = signal<'cash' | 'bank'>(this.data.subscription.payment_account_id ? 'bank' : 'cash');
  readonly bankAccountId = signal<string | null>(this.data.subscription.payment_account_id);
  readonly notes = signal('');

  readonly transactionOptions = computed<SelectOption<string>[]>(() => {
    const linkedIds = new Set(
      this.subscriptionsService.payments().map((payment) => payment.transaction_id).filter(Boolean),
    );
    return this.transactionsService
      .transactions()
      .filter(
        (transaction) =>
          transaction.direction === 'out' &&
          !linkedIds.has(transaction.id),
      )
      .map((transaction) => ({
        value: transaction.id,
        label: `${transaction.occurred_on} · ₹${Number(transaction.amount).toFixed(2)}${transaction.notes ? ` · ${transaction.notes}` : ''}`,
        icon: 'receipt',
      }));
  });

  readonly accountOptions = computed<SelectOption<string>[]>(() =>
    this.bankAccountsService.bankAccounts().map((account) => ({
      value: account.id,
      label: account.is_primary ? `${account.bank_name} · ${account.account_name} ★` : `${account.bank_name} · ${account.account_name}`,
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    })),
  );

  canSave(): boolean {
    if (!this.paidOn()) return false;
    if (this.entryMode() === 'existing') return !!this.selectedTransactionId();
    const amount = this.amount();
    if (!(amount && amount > 0)) return false;
    return this.paymentMode() !== 'bank' || this.accountOptions().length === 0 || !!this.bankAccountId();
  }

  setEntryMode(mode: PaymentEntryMode): void {
    this.entryMode.set(mode);
    if (mode === 'new') this.selectedTransactionId.set(null);
  }

  selectTransaction(id: string | null): void {
    this.selectedTransactionId.set(id);
    const transaction = this.transactionsService.transactions().find((item) => item.id === id);
    if (transaction) this.amount.set(Number(transaction.amount));
  }

  setPaymentMode(mode: 'cash' | 'bank'): void {
    this.paymentMode.set(mode);
    if (mode === 'bank' && !this.bankAccountId()) {
      this.bankAccountId.set(this.bankAccountsService.primaryAccount()?.id ?? null);
    }
  }

  toNumber(value: string | number | null): number | null {
    return value === '' || value == null ? null : Number(value);
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.subscriptionsService.recordPayment({
        subscription_id: this.data.subscription.id,
        amount: Number(this.amount()),
        paid_on: toIsoDate(this.paidOn()!),
        transaction_id: this.entryMode() === 'existing' ? this.selectedTransactionId() : null,
        payment_mode: this.paymentMode(),
        bank_account_id: this.paymentMode() === 'bank' ? this.bankAccountId() : null,
        notes: this.notes(),
      });
      this.snack.open('Payment recorded and renewal advanced.', undefined, { duration: 2500 });
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t record payment — please try again.'), 'Dismiss', { duration: 4500 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
