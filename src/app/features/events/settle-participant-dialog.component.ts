import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { PaymentMode } from '../../core/models/domain.models';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { errorText } from '../../shared/utils/error-utils';

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
    LucideAngularModule,
    SignedMoneyPipe,
    SelectFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">Settle up with {{ data.participant.name }}</h2>
          <p class="dialog-subtitle">Clear event expense share for {{ data.participant.name }}</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
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
          {{ submitting() ? 'Settling…' : 'Settle Up' }}
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
      .settle-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
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
export class SettleParticipantDialogComponent {
  private readonly ref = inject(MatDialogRef<SettleParticipantDialogComponent>);
  private readonly eventsService = inject(EventsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

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

  openBankAccounts(): void {
    this.ref.close();
    void this.router.navigate(['/bank-accounts']);
  }
}
