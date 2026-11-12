import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import {
  MoneyHeldDirection,
  PaymentMode,
} from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { MoneyHeldService } from '../../core/services/money-held.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SheetDragCloseDirective } from '../../shared/directives/sheet-drag-close.directive';
import { errorText } from '../../shared/utils/error-utils';
import { isLessOrEqualCurrency } from '../../shared/utils/currency-utils';

export interface RecordMoneyHeldSheetData {
  heldPersonId: string;
  personName: string;
  direction?: MoneyHeldDirection;
}

@Component({
  selector: 'app-record-money-held-sheet',
  standalone: true,
  imports: [
    SheetDragCloseDirective,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="sheet">
      <div appSheetDragClose></div>
      <header class="sheet-header">
        <div>
          <h2>Money held</h2>
        </div>
        <mat-button-toggle-group
          [value]="direction()"
          (change)="direction.set($event.value)"
          hideSingleSelectionIndicator
          class="direction-toggle"
        >
          <mat-button-toggle value="received">Received</mat-button-toggle>
          <mat-button-toggle value="returned" [disabled]="outstanding() <= 0">Returned</mat-button-toggle>
        </mat-button-toggle-group>
      </header>

      @if (direction() === 'returned') {
        <div class="balance-hint">
          Outstanding for {{ data.personName }}: <strong>₹{{ outstanding().toFixed(2) }}</strong>
        </div>
      }

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [max]="direction() === 'returned' ? outstanding() : null"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amount.set(toNum($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

      <app-date-field
        label="Date"
        placeholder="Choose date"
        [value]="occurredOn()"
        (valueChange)="occurredOn.set($event)"
      />

      <div class="field-group">
        <label class="ft-label">Payment method</label>
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
            label="Bank account"
            placeholder="Select account"
            [options]="bankAccountOptions()"
            [value]="selectedBankAccountId()"
            (valueChange)="selectedBankAccountId.set($any($event))"
          />
        } @else {
          <div class="no-bank-notice">
            <lucide-icon name="alert-circle" />
            <span>No bank accounts added yet.</span>
            <button type="button" class="link-btn" (click)="openBankAccounts()">Add account</button>
          </div>
        }
      }

      <app-text-field
        label="Note (optional)"
        placeholder="e.g. Held for the apartment deposit"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($any($event) ?? '')"
      />

      <div class="hint">
        @if (direction() === 'received') {
          This will increase money held for {{ data.personName }}. It will not be counted as income.
        } @else {
          This will reduce money held for {{ data.personName }}. It will not be counted as an expense.
        }
      </div>

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button mat-flat-button color="primary" (click)="save()" [disabled]="!canSave() || submitting()">
          {{ submitting() ? 'Saving…' : 'Save record' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px 20px 20px;
      }
      .sheet-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      h2 { margin: 0; font-size: 17px; font-weight: 700; }
      .sheet-header p { margin: 4px 0 0; color: var(--app-ink-muted); font-size: 12px; }
      .direction-toggle { flex: 0 0 auto; transform: scale(.9); transform-origin: right top; }
      .balance-hint {
        padding: 10px 12px;
        border-radius: var(--app-radius-md);
        background: var(--app-accent-soft);
        color: var(--app-ink-muted);
        font-size: 13px;
      }
      .balance-hint strong { color: var(--app-ink); }
      .field-group { display: flex; flex-direction: column; gap: 6px; }
      .ft-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .payment-mode-toggle { display: flex; width: 100%; }
      .payment-mode-toggle mat-button-toggle { flex: 1; }
      .no-bank-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border: 1px dashed var(--app-hairline);
        border-radius: var(--app-radius-md);
        color: var(--app-ink-muted);
        font-size: 13px;
      }
      .no-bank-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .link-btn {
        margin-left: auto;
        padding: 0;
        border: 0;
        background: none;
        color: var(--app-accent);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      }
      .hint { color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    `,
  ],
})
export class RecordMoneyHeldSheetComponent {
  readonly data = inject<RecordMoneyHeldSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<RecordMoneyHeldSheetComponent>);
  private readonly moneyHeldService = inject(MoneyHeldService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly direction = signal<MoneyHeldDirection>(this.data.direction ?? 'received');
  readonly amount = signal<number | null>(null);
  readonly occurredOn = signal<Date | null>(new Date());
  readonly paymentMode = signal<PaymentMode>('cash');
  readonly selectedBankAccountId = signal<string | null>(null);
  readonly notes = signal('');
  readonly submitting = signal(false);
  readonly outstanding = computed(() => this.moneyHeldService.balanceFor(this.data.heldPersonId));

  readonly bankAccountOptions = computed<SelectOption[]>(() =>
    this.bankAccountsService.bankAccounts().map((account) => ({
      value: account.id,
      label: account.is_primary
        ? `${account.bank_name} (${account.account_name}) ★`
        : `${account.bank_name} (${account.account_name})`,
      icon: 'landmark',
    })),
  );

  readonly canSave = computed(() => {
    const value = this.amount();
    if (!value || value <= 0 || !this.occurredOn()) return false;
    if (this.direction() === 'returned' && !isLessOrEqualCurrency(value, this.outstanding())) {
      return false;
    }
    return !(this.paymentMode() === 'bank' && this.bankAccountOptions().length > 0 && !this.selectedBankAccountId());
  });

  constructor() {
    effect(() => {
      const primary = this.bankAccountsService.primaryAccount();
      const accounts = this.bankAccountsService.bankAccounts();
      if (primary && !this.selectedBankAccountId()) this.selectedBankAccountId.set(primary.id);
      if (accounts.length > 0 && this.paymentMode() === 'cash' && !this.userExplicitlySetCash) {
        this.paymentMode.set('bank');
        if (primary) this.selectedBankAccountId.set(primary.id);
      }
    });
  }

  private userExplicitlySetCash = false;

  setPaymentMode(mode: PaymentMode): void {
    this.userExplicitlySetCash = mode === 'cash';
    this.paymentMode.set(mode);
    if (mode === 'bank' && !this.selectedBankAccountId()) {
      this.selectedBankAccountId.set(this.bankAccountsService.primaryAccount()?.id ?? null);
    }
  }

  toNum(value: string | number | null): number | null {
    return typeof value === 'number' ? value : value ? Number(value) : null;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.moneyHeldService.record({
        held_person_id: this.data.heldPersonId,
        direction: this.direction(),
        amount: Number(this.amount()),
        occurred_on: toIsoDate(this.occurredOn())!,
        payment_mode: this.paymentMode(),
        bank_account_id: this.paymentMode() === 'bank' ? this.selectedBankAccountId() : null,
        notes: this.notes() || null,
      });
      this.snack.open('Money-held record saved.', undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t save — please try again.'), 'Dismiss', { duration: 4000 });
      this.submitting.set(false);
    }
  }

  close(): void { this.ref.dismiss(); }

  openBankAccounts(): void {
    this.ref.dismiss();
    void this.router.navigate(['/bank-accounts']);
  }
}

function toIsoDate(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
