import { Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { BankAccount, CardType, PaymentNetwork, CardTheme } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';

export interface BankAccountDialogData {
  account?: BankAccount;
  isFirstCard?: boolean;
  currentBalance?: number;
}

@Component({
  selector: 'app-bank-account-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    LucideAngularModule,
    TextFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">
            {{ isEdit ? 'Edit Bank Card' : (isFirstCard ? 'Add Your First Bank Card' : 'Add Bank Account') }}
          </h2>
          <p class="dialog-subtitle">Configure card details and physical appearance</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <!-- First Card Callout Notice -->
        @if (isFirstCard && !isEdit) {
          <div class="first-card-notice">
            <div class="notice-icon-tile">
              <lucide-icon name="sparkles" />
            </div>
            <div class="notice-body">
              <div class="notice-title">Primary Card Automatic Setup</div>
              <div class="notice-desc">
                This will be designated as your <strong>Primary Account</strong>. Your current net account balance
                (₹{{ currentBalance | number:'1.0-0' }}) and transactions will be linked to this card.
              </div>
            </div>
          </div>
        }

        <!-- Live Physical Card Preview -->
        <div class="preview-section">
          <div class="micro-label">LIVE CARD PREVIEW</div>
          <div class="card-item" [attr.data-theme]="theme()">
            <!-- Card Header -->
            <div class="card-header">
              <div class="bank-title-wrap">
                <lucide-icon name="landmark" class="bank-icon" />
                <span class="bank-name">{{ bankName() || 'Bank Name' }}</span>
              </div>
              <lucide-icon name="wifi" class="wifi-icon" />
            </div>

            <!-- Card Body (EMV Chip & Network Logo) -->
            <div class="card-body">
              <div class="emv-chip">
                <div class="chip-line"></div>
                <div class="chip-line"></div>
              </div>

              <div class="network-badge">
                @if (paymentNetwork() === 'visa') {
                  <span class="visa-logo">VISA</span>
                } @else if (paymentNetwork() === 'mastercard') {
                  <div class="mc-logo">
                    <span class="circle red"></span>
                    <span class="circle orange"></span>
                  </div>
                } @else if (paymentNetwork() === 'rupay') {
                  <span class="rupay-logo">RuPay</span>
                } @else if (paymentNetwork() === 'amex') {
                  <span class="amex-logo">AMEX</span>
                } @else {
                  <span class="generic-network">{{ paymentNetwork() | uppercase }}</span>
                }
              </div>
            </div>

            <!-- Card Number -->
            <div class="card-number">
              •••• •••• •••• {{ last4Digits() || '4329' }}
            </div>

            <!-- Card Footer Details -->
            <div class="card-footer">
              <div class="cardholder-group">
                <div class="card-meta-label">CARD HOLDER</div>
                <div class="card-meta-val">{{ cardholderName() || 'PRIMARY HOLDER' }}</div>
              </div>

              <div class="expiry-group">
                <div class="card-meta-label">EXPIRES</div>
                <div class="card-meta-val expiry-pill">{{ expiryDate() || '09/28' }}</div>
              </div>

              <div class="card-type-badge">
                {{ cardType() | uppercase }}
              </div>
            </div>
          </div>
        </div>

        <!-- Form Fields aligned with system theme -->
        <form (ngSubmit)="save()" class="form-layout">
          <!-- Bank Name Field -->
          <div class="form-group full">
            <app-text-field
              label="Bank Name"
              placeholder="Enter bank name (e.g. HDFC Bank, Chase, SBI)"
              leadIcon="building-2"
              [value]="bankName()"
              (valueChange)="bankName.set($any($event) ?? '')"
              [invalid]="touched() && !bankNameValid()"
              [hint]="touched() && !bankNameValid() ? 'Bank name is required' : undefined"
            />
          </div>

          <!-- Account Nickname -->
          <div class="form-group full">
            <app-text-field
              label="Card / Account Nickname"
              placeholder="e.g. Primary Salary Card, Travel Credit Card"
              leadIcon="credit-card"
              [value]="accountName()"
              (valueChange)="accountName.set($any($event) ?? '')"
            />
          </div>

          <!-- Card Type & Payment Network -->
          <div class="form-group half">
            <app-select-field
              label="Card Type"
              [options]="cardTypeOptions"
              [value]="cardType()"
              (valueChange)="cardType.set($any($event) ?? 'debit')"
            />
          </div>

          <div class="form-group half">
            <app-select-field
              label="Payment Network"
              [options]="networkOptions"
              [value]="paymentNetwork()"
              (valueChange)="paymentNetwork.set($any($event) ?? 'visa')"
            />
          </div>

          <!-- Last 4 Digits & Expiry Date -->
          <div class="form-group half">
            <app-text-field
              label="Last 4 Digits"
              placeholder="e.g. 4329"
              inputmode="numeric"
              [maxlength]="4"
              [value]="last4Digits()"
              (valueChange)="last4Digits.set($any($event) ?? '')"
              [invalid]="touched() && !last4Valid()"
              [hint]="touched() && !last4Valid() ? 'Must be 4 digits' : undefined"
            />
          </div>

          <div class="form-group half">
            <app-text-field
              label="Expiry Date"
              placeholder="MM/YY (e.g. 09/28)"
              [maxlength]="5"
              [value]="expiryDate()"
              (valueChange)="expiryDate.set($any($event) ?? '')"
              [invalid]="touched() && !expiryValid()"
              [hint]="touched() && !expiryValid() ? 'Must be MM/YY format' : undefined"
            />
          </div>

          <!-- Cardholder Name -->
          <div class="form-group full">
            <app-text-field
              label="Cardholder Name"
              placeholder="e.g. PRIMARY HOLDER"
              leadIcon="circle-user"
              [value]="cardholderName()"
              (valueChange)="cardholderName.set($any($event) ?? '')"
            />
          </div>

          <!-- Card Balance & Credit Limit -->
          <div class="form-group" [class.half]="cardType() === 'credit'" [class.full]="cardType() !== 'credit'">
            <app-text-field
              label="Card Balance (₹)"
              type="number"
              placeholder="0"
              leadIcon="wallet"
              [value]="balance() ?? null"
              (valueChange)="onBalanceChange($event)"
            />
          </div>

          @if (cardType() === 'credit') {
            <div class="form-group half">
              <app-text-field
                label="Credit Limit (₹)"
                type="number"
                placeholder="100000"
                leadIcon="credit-card"
                [value]="creditLimit() ?? null"
                (valueChange)="onCreditLimitChange($event)"
              />
            </div>
          }

          <!-- Card Theme Color Picker -->
          <div class="form-group full">
            <label class="ft-label">Card Theme Color</label>
            <div class="theme-picker">
              @for (t of themes; track t.id) {
                <button
                  type="button"
                  class="theme-swatch"
                  [attr.data-theme]="t.id"
                  [class.active]="theme() === t.id"
                  (click)="theme.set(t.id)"
                  [title]="t.name"
                >
                  @if (theme() === t.id) {
                    <lucide-icon name="check" class="check-icon" />
                  }
                </button>
              }
            </div>
          </div>

          <!-- Primary Card Checkbox -->
          @if (!isFirstCard) {
            <div class="form-group full checkbox-row">
              <label class="custom-checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="isPrimary"
                  name="isPrimary"
                  class="system-checkbox"
                />
                <span>Set as primary card / default payment method</span>
              </label>
            </div>
          }
        </form>
      </mat-dialog-content>

      <!-- Actions Footer -->
      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" class="cancel-btn">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="touched() && !canSave()"
          class="save-btn"
        >
          {{ isEdit ? 'Save Changes' : 'Add Card' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        max-width: 520px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header */
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0 16px 12px 16px;;
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
        padding: 0 4px;
      }
      .close-btn {
        color: var(--app-ink-muted);
      }

      .dialog-content {
        padding-top: 16px !important;
        padding-bottom: 16px !important;
        max-height: 72vh;
        overflow-y: auto;
      }

      /* First Card Setup Notice */
      .first-card-notice {
        display: flex;
        gap: 12px;
        background: var(--app-accent-soft);
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-md);
        padding: 12px 14px;
        margin-bottom: 18px;
      }
      .notice-icon-tile {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--app-ink-dark);
        color: #fff;
        display: grid;
        place-items: center;
        flex-shrink: 0;

        lucide-icon {
          width: 16px;
          height: 16px;
        }
      }
      .notice-title {
        font-size: 13.5px;
        font-weight: 700;
        color: var(--app-ink);
      }
      .notice-desc {
        font-size: 12px;
        color: var(--app-ink-muted);
        margin-top: 2px;
        line-height: 1.4;
      }

      /* Micro Label */
      .micro-label {
        font-size: 10.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--app-ink-muted);
        margin-bottom: 8px;
      }

      /* Live Card Preview */
      .preview-section {
        margin-bottom: 20px;
      }
      .card-item {
        position: relative;
        width: 100%;
        border-radius: var(--app-radius-lg);
        padding: 20px;
        color: #ffffff;
        box-shadow: var(--app-shadow-md);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 195px;
        transition: all 0.25s ease;
        overflow: hidden;

        &::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.14) 0%, transparent 60%);
          pointer-events: none;
        }
      }

      /* Card Color Themes */
      .card-item[data-theme='blue'] {
        background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%);
      }
      .card-item[data-theme='purple'] {
        background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 60%, #8b5cf6 100%);
      }
      .card-item[data-theme='dark'] {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%);
      }
      .card-item[data-theme='emerald'] {
        background: linear-gradient(135deg, #064e3b 0%, #059669 60%, #10b981 100%);
      }
      .card-item[data-theme='sunset'] {
        background: linear-gradient(135deg, #9a3412 0%, #ea580c 60%, #f97316 100%);
      }
      .card-item[data-theme='gold'] {
        background: linear-gradient(135deg, #78350f 0%, #b45309 60%, #d97706 100%);
      }
      .card-item[data-theme='rose'] {
        background: linear-gradient(135deg, #881337 0%, #be123c 60%, #f43f5e 100%);
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 2;
      }
      .bank-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .bank-icon {
        width: 18px;
        height: 18px;
        opacity: 0.9;
      }
      .bank-name {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .wifi-icon {
        width: 18px;
        height: 18px;
        opacity: 0.8;
        transform: rotate(90deg);
      }

      .card-body {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 12px 0;
        z-index: 2;
      }

      .emv-chip {
        width: 40px;
        height: 28px;
        background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
        border-radius: 5px;
        padding: 4px;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.4);
      }
      .chip-line {
        height: 1px;
        background: rgba(0, 0, 0, 0.3);
        width: 100%;
      }

      .visa-logo {
        font-size: 18px;
        font-weight: 900;
        font-style: italic;
        letter-spacing: 1px;
      }
      .mc-logo {
        display: flex;
        align-items: center;
      }
      .mc-logo .circle {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: inline-block;
      }
      .mc-logo .circle.red { background: #eb001b; }
      .mc-logo .circle.orange { background: #f79e1b; margin-left: -9px; opacity: 0.9; }
      .rupay-logo {
        font-size: 14px;
        font-weight: 800;
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 7px;
        border-radius: 4px;
      }
      .amex-logo {
        font-size: 13px;
        font-weight: 900;
        background: #006fcf;
        padding: 2px 7px;
        border-radius: 4px;
      }
      .generic-network {
        font-size: 13px;
        font-weight: 700;
      }

      .card-number {
        font-family: monospace;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 2px;
        margin-bottom: 14px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
        z-index: 2;
      }

      .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        z-index: 2;
      }
      .card-meta-label {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.8px;
        opacity: 0.7;
        margin-bottom: 2px;
      }
      .card-meta-val {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
      }
      .expiry-pill {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: 10px;
        font-family: monospace;
      }
      .card-type-badge {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.5px;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
      }

      /* Form Layout matching system components */
      .form-layout {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
      }
      .form-group.full {
        width: 100%;
      }
      .form-group.half {
        width: calc(50% - 7px);
      }

      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }

      /* Swatches */
      .theme-picker {
        display: flex;
        gap: 10px;
      }
      .theme-swatch {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        display: grid;
        place-items: center;
        color: #fff;
        transition: transform 0.15s ease, border-color 0.15s ease;

        &:hover {
          transform: scale(1.08);
        }
        &.active {
          border-color: var(--app-ink);
          transform: scale(1.12);
        }
      }
      .theme-swatch[data-theme='blue'] { background: #2563eb; }
      .theme-swatch[data-theme='purple'] { background: #7c3aed; }
      .theme-swatch[data-theme='dark'] { background: #1e293b; }
      .theme-swatch[data-theme='emerald'] { background: #059669; }
      .theme-swatch[data-theme='sunset'] { background: #ea580c; }
      .theme-swatch[data-theme='gold'] { background: #b45309; }
      .theme-swatch[data-theme='rose'] { background: #be123c; }

      .check-icon {
        width: 16px;
        height: 16px;
      }

      .checkbox-row {
        margin-top: 4px;
      }
      .custom-checkbox-label {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: var(--app-ink);
        cursor: pointer;
      }
      .system-checkbox {
        width: 18px;
        height: 18px;
        accent-color: var(--app-ink-dark);
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
export class BankAccountDialogComponent {
  readonly isEdit: boolean;
  readonly isFirstCard: boolean;
  readonly currentBalance: number;

  readonly cardTypeOptions: SelectOption<CardType>[] = [
    { label: 'Debit Card', value: 'debit', icon: 'credit-card' },
    { label: 'Credit Card', value: 'credit', icon: 'credit-card' },
    { label: 'Savings Account', value: 'savings', icon: 'landmark' },
    { label: 'Current Account', value: 'current', icon: 'building-2' },
    { label: 'Prepaid Card', value: 'prepaid', icon: 'wallet' },
  ];

  readonly networkOptions: SelectOption<PaymentNetwork>[] = [
    { label: 'Visa', value: 'visa' },
    { label: 'Mastercard', value: 'mastercard' },
    { label: 'RuPay', value: 'rupay' },
    { label: 'American Express', value: 'amex' },
    { label: 'Discover', value: 'discover' },
  ];

  readonly themes: { id: CardTheme; name: string }[] = [
    { id: 'blue', name: 'Royal Blue' },
    { id: 'purple', name: 'Purple' },
    { id: 'dark', name: 'Slate Dark' },
    { id: 'emerald', name: 'Emerald' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'gold', name: 'Gold' },
    { id: 'rose', name: 'Rose' },
  ];

  bankName = signal('');
  accountName = signal('');
  cardType = signal<CardType>('debit');
  paymentNetwork = signal<PaymentNetwork>('visa');
  last4Digits = signal('4329');
  expiryDate = signal('09/28');
  cardholderName = signal('');
  balance = signal<number | undefined>(undefined);
  creditLimit = signal<number | undefined>(undefined);
  theme = signal<CardTheme>('blue');
  isPrimary = signal(false);
  touched = signal(false);

  readonly bankNameValid = computed(() => this.bankName().trim().length > 0);

  readonly last4Valid = computed(() => {
    const v = this.last4Digits().trim();
    return /^\d{4}$/.test(v);
  });

  readonly expiryValid = computed(() => {
    const v = this.expiryDate().trim();
    return /^(0[1-9]|1[0-2])\/\d{2}$/.test(v);
  });

  readonly canSave = computed(() => {
    return this.bankNameValid() && this.last4Valid() && this.expiryValid();
  });

  constructor(
    private dialogRef: MatDialogRef<BankAccountDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BankAccountDialogData,
  ) {
    this.isEdit = !!data?.account;
    this.isFirstCard = !!data?.isFirstCard;
    this.currentBalance = data?.currentBalance ?? 0;

    if (data?.account) {
      const a = data.account;
      this.bankName.set(a.bank_name);
      this.accountName.set(a.account_name);
      this.cardType.set(a.card_type);
      this.paymentNetwork.set(a.payment_network);
      this.last4Digits.set(a.card_number_masked);
      this.expiryDate.set(a.expiry_date);
      this.cardholderName.set(a.cardholder_name);
      this.balance.set(a.balance);
      this.creditLimit.set(a.credit_limit);
      this.theme.set(a.theme);
      this.isPrimary.set(!!a.is_primary);
    } else if (this.isFirstCard) {
      this.isPrimary.set(true);
      if (this.currentBalance > 0) {
        this.balance.set(this.currentBalance);
      }
    }
  }

  onBalanceChange(val: string | number | null): void {
    if (val == null || val === '') {
      this.balance.set(undefined);
    } else {
      this.balance.set(Number(val));
    }
  }

  onCreditLimitChange(val: string | number | null): void {
    if (val == null || val === '') {
      this.creditLimit.set(undefined);
    } else {
      this.creditLimit.set(Number(val));
    }
  }

  save(): void {
    this.touched.set(true);
    if (!this.canSave()) return;

    const result: Partial<BankAccount> = {
      bank_name: this.bankName().trim(),
      account_name: this.accountName().trim() || `${this.bankName().trim()} Card`,
      card_type: this.cardType(),
      payment_network: this.paymentNetwork(),
      card_number_masked: this.last4Digits().trim(),
      expiry_date: this.expiryDate().trim(),
      cardholder_name: this.cardholderName().trim().toUpperCase() || 'PRIMARY HOLDER',
      balance: this.balance() ?? (this.isFirstCard ? this.currentBalance : 0),
      credit_limit: this.cardType() === 'credit' ? (this.creditLimit() ?? 100000) : undefined,
      theme: this.theme(),
      is_primary: this.isFirstCard ? true : this.isPrimary(),
    };

    this.dialogRef.close(result);
  }

  close(): void {
    this.dialogRef.close();
  }
}
