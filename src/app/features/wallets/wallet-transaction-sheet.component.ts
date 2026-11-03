import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';

import {
  PaymentMode,
  Wallet,
  WalletTransaction,
  WalletTransactionKind,
} from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import {
  WalletTransactionInput,
  WalletsService,
} from '../../core/services/wallets.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errText } from '../../shared/utils/error-utils';

export interface WalletTransactionSheetData {
  wallet: Wallet;
  kind: WalletTransactionKind;
  transaction?: WalletTransaction;
}

@Component({
  selector: 'app-wallet-transaction-sheet',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    DecimalPipe,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="sheet">
      <header class="sheet-header">
        <div class="header-icon"><lucide-icon name="wallet" /></div>
        <div>
          <h2>{{ isEdit ? 'Edit wallet entry' : 'Update wallet' }}</h2>
          <p>{{ wallet.name }} · balance {{ wallet.balance | number: '1.2-2' }}</p>
        </div>
      </header>

      <div class="type-field">
        <label class="field-label">Entry type</label>
        <mat-button-toggle-group
          [value]="kind()"
          (change)="kind.set($event.value)"
          [disabled]="isEdit"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="recharge"><lucide-icon name="arrow-down" /> Recharge</mat-button-toggle>
          <mat-button-toggle value="spend"><lucide-icon name="arrow-up" /> Spending</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        [value]="amount()"
        [invalid]="touched() && !amountValid()"
        [hint]="amountHint()"
        (valueChange)="amount.set(toNumber($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

      @if (kind() === 'recharge') {
        <div class="type-field">
          <label class="field-label">Recharge from</label>
          <mat-button-toggle-group [value]="fundingMode()" (change)="setFundingMode($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="cash">Cash</mat-button-toggle>
            <mat-button-toggle value="bank">Bank account</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        @if (fundingMode() === 'bank') {
          <app-select-field
            label="Bank account"
            placeholder="Choose account"
            [options]="bankOptions()"
            [value]="bankAccountId()"
            [invalid]="touched() && !bankAccountId()"
            (valueChange)="bankAccountId.set($any($event))"
          />
        }
      } @else {
        <div class="wallet-category">
          <div class="wallet-category-icon"><lucide-icon name="wallet" /></div>
          <div>
            <span class="field-label">Category</span>
            <strong>Wallet spending</strong>
            <small>{{ wallet.name }} expenses stay grouped under this wallet.</small>
          </div>
        </div>
      }

      <app-date-field
        label="Date"
        placeholder="Choose date"
        [value]="occurredDate()"
        (valueChange)="occurredDate.set($event)"
      />

      <app-text-field
        label="Note (optional)"
        placeholder="Add a note"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($any($event) ?? '')"
      />

      @if (errorMessage()) {
        <div class="save-error" role="alert"><lucide-icon name="alert-circle" /> {{ errorMessage() }}</div>
      }

      <div class="actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!canSave() || submitting()">
          {{ submitting() ? 'Saving…' : (isEdit ? 'Save changes' : (kind() === 'recharge' ? 'Recharge wallet' : 'Record spending')) }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
      .sheet-header { display: flex; align-items: center; gap: 12px; margin-bottom: 2px; }
      .header-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: var(--app-accent-soft); color: var(--app-accent); }
      .header-icon lucide-icon { width: 21px; height: 21px; }
      h2 { margin: 0; color: var(--app-ink); font-size: 18px; font-weight: 700; }
      .sheet-header p { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; }
      .type-field { display: flex; flex-direction: column; gap: 6px; }
      .field-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .type-field mat-button-toggle-group { display: flex; width: 100%; }
      .type-field mat-button-toggle { flex: 1; min-width: 0; }
      .type-field mat-button-toggle lucide-icon { width: 15px; height: 15px; margin-right: 4px; }
      .wallet-category { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 1px solid var(--app-hairline); border-radius: 13px; background: var(--app-input-bg); }
      .wallet-category-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 auto; border-radius: 10px; background: var(--app-surface); color: var(--app-accent); box-shadow: var(--app-shadow-sm); }
      .wallet-category-icon lucide-icon { width: 16px; height: 16px; }
      .wallet-category .field-label { display: block; margin-bottom: 2px; color: var(--app-ink-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
      .wallet-category strong { display: block; color: var(--app-ink); font-size: 13px; }
      .wallet-category small { display: block; margin-top: 2px; color: var(--app-ink-muted); font-size: 11px; }
      .save-error { background: var(--app-negative-soft); color: var(--app-negative); }
      .save-error lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
      .actions button { border-radius: 999px; }
    `,
  ],
})
export class WalletTransactionSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<WalletTransactionSheetComponent>);
  private readonly data = inject<WalletTransactionSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly walletsService = inject(WalletsService);
  private readonly bankAccountsService = inject(BankAccountsService);

  readonly wallet = this.data.wallet;
  readonly isEdit = !!this.data.transaction;
  readonly kind = signal<WalletTransactionKind>(this.data.transaction?.kind ?? this.data.kind);
  readonly amount = signal<number | null>(this.data.transaction?.amount ?? null);
  readonly fundingMode = signal<PaymentMode>(
    this.data.transaction?.funding_mode ?? (this.bankAccountsService.primaryAccount() ? 'bank' : 'cash'),
  );
  readonly bankAccountId = signal<string | null>(this.data.transaction?.bank_account_id ?? null);
  readonly occurredDate = signal<Date | null>(parseIsoDate(this.data.transaction?.occurred_on) ?? new Date());
  readonly notes = signal(this.data.transaction?.notes ?? '');
  readonly touched = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly bankOptions = computed<SelectOption<string>[]>(() =>
    this.bankAccountsService.bankAccounts().map((account) => ({
      label: `${account.account_name || account.bank_name} · ₹${Number(account.balance ?? 0).toFixed(2)}`,
      value: account.id,
      icon: 'landmark',
    })),
  );

  readonly availableBalance = computed(() =>
    this.wallet.balance + (this.data.transaction?.kind === 'spend' ? this.data.transaction.amount : 0),
  );

  readonly amountValid = computed(() => {
    const value = this.amount();
    return !!value && value > 0 && (this.kind() === 'recharge' || value <= this.availableBalance() + 0.000001);
  });

  readonly canSave = computed(() => {
    if (!this.amountValid() || !this.occurredDate()) return false;
    if (this.kind() === 'spend') return true;
    return this.fundingMode() === 'cash' || !!this.bankAccountId();
  });

  readonly amountHint = computed(() => {
    if (this.kind() === 'spend' && !this.amountValid()) {
      return `Available wallet balance: ₹${Number(this.availableBalance()).toFixed(2)}`;
    }
    return undefined;
  });

  toNumber(value: string | number | null): number | null {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  setFundingMode(mode: PaymentMode): void {
    this.fundingMode.set(mode);
    if (mode === 'bank' && !this.bankAccountId()) {
      this.bankAccountId.set(this.bankAccountsService.primaryAccount()?.id ?? null);
    }
  }

  async save(): Promise<void> {
    this.touched.set(true);
    this.errorMessage.set(null);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const input: WalletTransactionInput = {
        wallet_id: this.wallet.id,
        kind: this.kind(),
        amount: this.amount()!,
        occurred_on: dateToIso(this.occurredDate()!),
        funding_mode: this.kind() === 'recharge' ? this.fundingMode() : null,
        bank_account_id:
          this.kind() === 'recharge' && this.fundingMode() === 'bank' ? this.bankAccountId() : null,
        notes: this.notes(),
      };
      if (this.data.transaction) {
        await this.walletsService.updateTransaction(this.data.transaction.id, input);
      } else {
        await this.walletsService.createTransaction(input);
      }
      this.ref.dismiss(true);
    } catch (error: unknown) {
      this.errorMessage.set(errText(error, 'Could not save the wallet entry.'));
    } finally {
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }
}

function parseIsoDate(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function dateToIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
