import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { CreateInterestEntryInput, InterestService } from '../../core/services/interest.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';
import { isEqualCurrency, roundCurrency } from '../../shared/utils/currency-utils';

@Component({
  selector: 'app-interest-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div>
          <h2 mat-dialog-title>Add Interest</h2>
          <p class="dialog-subtitle">Record interest actually credited to a bank account.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <app-text-field
            class="full"
            label="Amount"
            placeholder="0.00"
            type="number"
            inputmode="decimal"
            [min]="0"
            [step]="0.01"
            leadIcon="percent"
            [value]="amount()"
            [invalid]="touched() && !amountValid()"
            (valueChange)="amount.set(toNumber($event))"
            [autofocus]="true"
          ><span prefix>₹</span></app-text-field>

          <app-date-field
            label="Date"
            placeholder="When it was credited"
            [value]="occurredOn()"
            [invalid]="touched() && !occurredOn()"
            (valueChange)="occurredOn.set($event)"
          />

          <div class="full">
            @if (accountOptions().length > 0) {
              <app-select-field
                label="Bank account"
                placeholder="Select account"
                [options]="accountOptions()"
                [value]="bankAccountId()"
                [invalid]="touched() && !bankAccountId()"
                (valueChange)="bankAccountId.set($any($event) || null)"
              />
            } @else {
              <div class="no-bank-notice">
                <lucide-icon name="alert-circle" />
                <span>No bank accounts added yet.</span>
                <button type="button" class="link-btn" (click)="openBankAccounts()">Add account</button>
              </div>
            }
          </div>

          <div class="full">
            <app-text-field
              label="Notes (optional)"
              placeholder="e.g. Savings account quarterly credit"
              leadIcon="sticky-note"
              [maxlength]="120"
              [value]="notes()"
              (valueChange)="notes.set($any($event) ?? '')"
            />
          </div>

          <div class="full hint">
            <lucide-icon name="shield-check" />
            <span>
              Record only interest your bank has actually credited — estimated or expected
              interest is never counted. This is tracked separately and is never treated
              as personal income.
            </span>
          </div>

          @if (touched() && duplicate()) {
            <div class="full error-notice">
              <lucide-icon name="alert-circle" />
              <span>A matching entry already exists for this date, account, and amount.</span>
            </div>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Add Interest' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
      .dialog-container { max-width: 520px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { max-height: 75vh; padding: 16px !important; }
      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
      .full { grid-column: 1 / -1; }
      .hint, .error-notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .hint lucide-icon, .error-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; color: var(--app-accent); }
      .error-notice { background: var(--app-negative-soft, rgba(239, 68, 68, .1)); color: var(--app-negative); }
      .error-notice lucide-icon { color: var(--app-negative); }
      .no-bank-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 12px;
        border: 1px dashed var(--app-hairline);
        border-radius: 13px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .no-bank-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .link-btn {
        margin-left: auto;
        border: 0;
        background: transparent;
        color: var(--app-accent);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
      }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
      @media (max-width: 540px) { .form-grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class InterestDialogComponent {
  private readonly ref = inject(MatDialogRef<InterestDialogComponent>);
  private readonly interestService = inject(InterestService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly amount = signal<number | null>(null);
  readonly occurredOn = signal<Date | null>(new Date());
  readonly bankAccountId = signal<string | null>(null);
  readonly notes = signal('');

  readonly accountOptions = () =>
    this.bankAccountsService.bankAccounts().map<SelectOption<string>>((account) => ({
      value: account.id,
      label: account.is_primary
        ? `${account.bank_name} · ${account.account_name} ★`
        : `${account.bank_name} · ${account.account_name}`,
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    }));

  /** Same date + account + amount already recorded → duplicate. */
  readonly duplicate = computed(() => {
    const amount = this.amount();
    const on = toIsoDate(this.occurredOn());
    const bankId = this.bankAccountId();
    if (!amount || !on || !bankId) return false;
    return this.interestService.entries().some(
      (entry) =>
        entry.occurred_on === on &&
        entry.bank_account_id === bankId &&
        isEqualCurrency(Number(entry.amount), roundCurrency(amount)),
    );
  });

  amountValid(): boolean {
    const value = this.amount();
    return !!value && value > 0;
  }

  canSave(): boolean {
    return (
      this.amountValid() &&
      !!this.occurredOn() &&
      !!this.bankAccountId() &&
      !this.duplicate()
    );
  }

  toNumber(value: string | number | null): number | null {
    return value === '' || value == null ? null : Number(value);
  }

  openBankAccounts(): void {
    this.ref.close();
    void this.router.navigate(['/bank-accounts']);
  }

  async save(): Promise<void> {
    this.touched.set(true);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);

    const base = {
      bank_account_id: this.bankAccountId()!,
      amount: Number(this.amount()),
      occurred_on: toIsoDate(this.occurredOn()!)!,
      notes: this.notes().trim() || null,
    };

    try {
      await this.interestService.createEntry(base satisfies CreateInterestEntryInput);
      this.snack.open('Interest recorded.', undefined, { duration: 2000 });
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t save the interest entry.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}

function toIsoDate(value: Date | null): string | null {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}
