import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { Subscription } from '../../core/models/domain.models';
import { SubscriptionsService } from '../../core/services/subscriptions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';

export interface RecordSubscriptionPaymentDialogData {
  subscription: Subscription;
}

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
        <div>
          <h2 mat-dialog-title>Renew {{ data.subscription.name }}</h2>
          <p class="dialog-subtitle">Records today's payment and pushes the expiry date forward.</p>
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
              [invalid]="touched() && !bankAccountId()"
              (valueChange)="bankAccountId.set($any($event))"
            />
          } @else {
            <div class="notice"><lucide-icon name="info" /><span>Add a bank account first, or choose cash.</span></div>
          }
        }

        <app-date-field
          label="New expiry date"
          placeholder="When the renewed plan ends"
          [value]="newExpiryDate()"
          [invalid]="touched() && !newExpiryValid()"
          (valueChange)="newExpiryDate.set($event)"
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
          {{ submitting() ? 'Renewing…' : 'Renew' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
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
      .notice { color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .notice { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--app-accent-soft); }
      .notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
    `,
  ],
})
export class RecordSubscriptionPaymentDialogComponent {
  readonly data = inject<RecordSubscriptionPaymentDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RecordSubscriptionPaymentDialogComponent>);
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);

  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly amount = signal<number | null>(this.data.subscription.amount);
  readonly newExpiryDate = signal<Date | null>(defaultExpiryDate(this.data.subscription));
  readonly paymentMode = signal<'cash' | 'bank'>(this.data.subscription.payment_account_id ? 'bank' : 'cash');
  readonly bankAccountId = signal<string | null>(this.data.subscription.payment_account_id);
  readonly notes = signal('');

  readonly accountOptions = computed<SelectOption<string>[]>(() =>
    this.bankAccountsService.bankAccounts().map((account) => ({
      value: account.id,
      label: account.is_primary ? `${account.bank_name} · ${account.account_name} ★` : `${account.bank_name} · ${account.account_name}`,
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    })),
  );

  canSave(): boolean {
    const amount = this.amount();
    if (!(amount && amount > 0)) return false;
    if (!this.newExpiryValid()) return false;
    return this.paymentMode() !== 'bank' || this.accountOptions().length === 0 || !!this.bankAccountId();
  }

  newExpiryValid(): boolean {
    const expiry = this.newExpiryDate();
    return !!expiry && toIsoDate(expiry) >= todayIso();
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
    this.touched.set(true);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const today = todayIso();
      await this.subscriptionsService.recordPayment({
        subscription_id: this.data.subscription.id,
        amount: Number(this.amount()),
        paid_on: today,
        new_expiry_date: toIsoDate(this.newExpiryDate()!),
        payment_mode: this.paymentMode(),
        bank_account_id: this.paymentMode() === 'bank' ? this.bankAccountId() : null,
        notes: this.notes(),
      });
      this.snack.open('Renewed — payment recorded and expiry extended.', undefined, { duration: 2500 });
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t renew — please try again.'), 'Dismiss', { duration: 4500 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}

function todayIso(): string {
  return toIsoDate(new Date());
}

/** Natural next expiry: one billing cycle past the current expiry (or today if already past). */
function defaultExpiryDate(subscription: Subscription): Date {
  const cycle = subscription.billing_cycle;
  const current = parseIsoDate(subscription.end_date) ?? parseIsoDate(subscription.next_renewal_date);
  const today = new Date();
  const base = current && current >= today ? current : today;
  const next = new Date(base);
  if (cycle === 'weekly') next.setDate(next.getDate() + 7);
  if (cycle === 'monthly') next.setMonth(next.getMonth() + 1);
  if (cycle === 'quarterly') next.setMonth(next.getMonth() + 3);
  if (cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
  return next;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
