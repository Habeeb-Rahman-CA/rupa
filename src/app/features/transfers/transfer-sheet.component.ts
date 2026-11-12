import { Component, computed, inject, signal } from '@angular/core';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

import { AccountTransfer, BankAccount } from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { AccountTransferInput, TransfersService } from '../../core/services/transfers.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SheetDragCloseDirective } from '../../shared/directives/sheet-drag-close.directive';
import { errText } from '../../shared/utils/error-utils';

export interface TransferSheetData {
  transfer?: AccountTransfer;
}

@Component({
  selector: 'app-transfer-sheet',
  standalone: true,
  imports: [
    SheetDragCloseDirective,
    MatButtonModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="sheet">
      <div appSheetDragClose></div>
      <header class="sheet-header">
        <div class="header-icon"><lucide-icon name="arrow-left-right" /></div>
        <div>
          <h2>{{ isEdit ? 'Edit transfer' : 'Transfer money' }}</h2>
          <p>Move money between your accounts without changing income or expense totals.</p>
        </div>
      </header>

      @if (accounts().length < 2) {
        <div class="notice">
          <lucide-icon name="info" />
          <span>Add at least two bank accounts before creating a transfer.</span>
        </div>
      }

      <app-select-field
        label="From account"
        placeholder="Choose source account"
        [options]="accountOptions()"
        [value]="sourceAccountId()"
        [invalid]="touched() && !sourceAccountId()"
        (valueChange)="sourceAccountId.set($any($event))"
      />

      <div class="direction-marker" aria-hidden="true">
        <lucide-icon name="arrow-down" />
      </div>

      <app-select-field
        label="To account"
        placeholder="Choose destination account"
        [options]="accountOptions()"
        [value]="destinationAccountId()"
        [invalid]="touched() && (!destinationAccountId() || sameAccount())"
        (valueChange)="destinationAccountId.set($any($event))"
      />

      @if (sameAccount()) {
        <div class="field-error">Source and destination accounts must be different.</div>
      }

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        [value]="amount()"
        [invalid]="touched() && amountInvalid()"
        [hint]="amountHint()"
        (valueChange)="amount.set(toNumber($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

      <app-date-field
        label="Date"
        placeholder="Choose transfer date"
        [value]="occurredDate()"
        (valueChange)="occurredDate.set($event)"
      />

      <app-text-field
        label="Note (optional)"
        placeholder="e.g. Move savings to emergency fund"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($any($event) ?? '')"
      />

      @if (errorMessage()) {
        <div class="save-error" role="alert">
          <lucide-icon name="alert-circle" />
          <span>{{ errorMessage() }}</span>
        </div>
      }

      <div class="actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : (isEdit ? 'Save changes' : 'Transfer money') }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
      .sheet-header { display: flex; align-items: center; gap: 12px; margin-bottom: 2px; }
      .header-icon { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto; border-radius: 13px; background: var(--app-accent-soft); color: var(--app-accent); }
      .header-icon lucide-icon { width: 21px; height: 21px; }
      h2 { margin: 0; color: var(--app-ink); font-size: 18px; font-weight: 700; }
      .sheet-header p { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .notice, .save-error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; font-size: 12px; line-height: 1.35; }
      .notice { background: var(--app-accent-soft); color: var(--app-ink-muted); }
      .save-error { background: var(--app-negative-soft); color: var(--app-negative); }
      .notice lucide-icon, .save-error lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .direction-marker { display: flex; justify-content: center; height: 0; position: relative; z-index: 1; color: var(--app-accent); }
      .direction-marker lucide-icon { width: 16px; height: 16px; padding: 3px; box-sizing: content-box; border-radius: 999px; background: var(--app-surface); border: 1px solid var(--app-hairline); }
      .field-error { margin-top: -8px; color: var(--app-negative); font-size: 12px; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
      .actions button { border-radius: 999px; }
    `,
  ],
})
export class TransferSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<TransferSheetComponent>);
  private readonly data = inject<TransferSheetData | null>(MAT_BOTTOM_SHEET_DATA, { optional: true });
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly transfersService = inject(TransfersService);

  readonly accounts = this.bankAccountsService.bankAccounts;
  readonly isEdit = !!this.data?.transfer;
  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sourceAccountId = signal<string | null>(this.data?.transfer?.source_account_id ?? null);
  readonly destinationAccountId = signal<string | null>(this.data?.transfer?.destination_account_id ?? null);
  readonly amount = signal<number | null>(this.data?.transfer?.amount ?? null);
  readonly occurredDate = signal<Date | null>(parseIsoDate(this.data?.transfer?.occurred_on) ?? new Date());
  readonly notes = signal(this.data?.transfer?.notes ?? '');

  readonly accountOptions = computed<SelectOption<string>[]>(() =>
    this.accounts().map((account) => ({
      value: account.id,
      label: this.accountLabel(account),
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    })),
  );

  readonly sameAccount = computed(
    () =>
      !!this.sourceAccountId() &&
      !!this.destinationAccountId() &&
      this.sourceAccountId() === this.destinationAccountId(),
  );

  readonly availableBalance = computed<number | null>(() => {
    const id = this.sourceAccountId();
    if (!id) return null;
    const account = this.accounts().find((item) => item.id === id);
    if (!account) return null;
    const current = this.data?.transfer;
    let adjustment = 0;
    if (current?.source_account_id === id) adjustment += Number(current.amount);
    if (current?.destination_account_id === id) adjustment -= Number(current.amount);
    return Number(account.balance ?? 0) + adjustment;
  });

  readonly amountInvalid = computed(() => {
    const value = this.amount();
    return !(value && value > 0) || this.exceedsBalance();
  });

  readonly exceedsBalance = computed(() => {
    const value = this.amount();
    const available = this.availableBalance();
    return value != null && available != null && value > available + 0.000001;
  });

  readonly amountHint = computed(() => {
    if (this.exceedsBalance() && this.availableBalance() != null) {
      return `Available balance: ₹${this.availableBalance()!.toFixed(2)}`;
    }
    return undefined;
  });

  readonly canSave = computed(() => {
    const value = this.amount();
    return (
      !!this.sourceAccountId() &&
      !!this.destinationAccountId() &&
      !this.sameAccount() &&
      !!this.occurredDate() &&
      !!value &&
      value > 0 &&
      !this.exceedsBalance()
    );
  });

  async save(): Promise<void> {
    this.touched.set(true);
    this.errorMessage.set(null);
    if (!this.canSave()) return;

    this.submitting.set(true);
    try {
      const input: AccountTransferInput = {
        source_account_id: this.sourceAccountId()!,
        destination_account_id: this.destinationAccountId()!,
        amount: this.amount()!,
        occurred_on: dateToIso(this.occurredDate()!),
        notes: this.notes(),
      };

      if (this.data?.transfer) {
        await this.transfersService.update(this.data.transfer.id, input);
      } else {
        await this.transfersService.create(input);
      }
      this.ref.dismiss(true);
    } catch (error: unknown) {
      this.errorMessage.set(errText(error, 'Could not save the transfer.'));
    } finally {
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }

  toNumber(value: string | number | null): number | null {
    if (value === '' || value == null) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  private accountLabel(account: BankAccount): string {
    const name = account.account_name || account.bank_name;
    const balance = Number(account.balance ?? 0).toFixed(2);
    return `${name} · ₹${balance}`;
  }
}

function parseIsoDate(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateToIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
