import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { PaymentMode } from '../../core/models/domain.models';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';

export interface SettleParticipantDialogData {
  participant: ParticipantWithMeta;
}

@Component({
  selector: 'app-settle-participant-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    SignedMoneyPipe,
    SelectFieldComponent,
  ],
  template: `
    <h2 mat-dialog-title>Settle up with {{ data.participant.name }}</h2>

    <mat-dialog-content class="content">
      <div class="settle-info">
        <span>Amount to receive:</span>
        <strong class="money-positive">{{ data.participant.totalShare | signedMoney:'in' }}</strong>
      </div>

      <div class="field-group">
        <label class="ft-label">Receive Into</label>
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

      @if (paymentMode() === 'bank' && bankAccountOptions().length > 0) {
        <app-select-field
          label="Bank Account"
          placeholder="Select Bank Account"
          [options]="bankAccountOptions()"
          [value]="selectedBankAccountId()"
          (valueChange)="selectedBankAccountId.set($any($event))"
        />
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        (click)="save()"
        [disabled]="!canSave() || submitting()"
      >
        {{ submitting() ? 'Settling…' : 'Settle Up' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 310px;
      }
      .settle-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0;
        background: var(--app-bg-hover);
        border-radius: var(--app-radius-md);
        font-size: 14px;
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ft-label {
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
    `,
  ],
})
export class SettleParticipantDialogComponent {
  private readonly ref = inject(MatDialogRef<SettleParticipantDialogComponent>);
  private readonly eventsService = inject(EventsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);

  readonly data = inject<SettleParticipantDialogData>(MAT_DIALOG_DATA);
  readonly submitting = signal(false);

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
    if (this.paymentMode() === 'bank' && this.bankAccountOptions().length > 0 && !this.selectedBankAccountId()) {
      return false;
    }
    return true;
  });

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const mode = this.paymentMode();
      const bankId = mode === 'bank' ? this.selectedBankAccountId() : null;

      await this.eventsService.settleParticipant(
        this.data.participant.id,
        mode,
        bankId,
      );
      this.snack.open(`${this.data.participant.name} is all settled up.`, undefined, { duration: 2000 });
      this.ref.close({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t settle — please try again.'), 'Dismiss', { duration: 4000 });
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
