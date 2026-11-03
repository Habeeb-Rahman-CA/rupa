import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { AccountTransfer } from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { TransfersService } from '../../core/services/transfers.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { errText } from '../../shared/utils/error-utils';
import { TransferSheetComponent, TransferSheetData } from './transfer-sheet.component';

@Component({
  selector: 'app-transfers-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header title="Transfers" subtitle="Move money between your accounts">
      <button class="add-transfer-btn" type="button" (click)="openAdd()" [disabled]="accounts().length < 2">
        <lucide-icon name="plus" />
        <span>Transfer</span>
      </button>
    </app-page-header>

    @if (!isAvailable()) {
      <app-empty-state
        icon="arrow-left-right"
        title="Transfers need setup"
        message="Apply database migration 0009_account_transfers.sql, then reload the app."
      />
    } @else if (isLoading() && transfers().length === 0) {
      <app-loading-state label="Loading transfers…" />
    } @else if (accounts().length < 2) {
      <app-empty-state
        icon="landmark"
        title="Add two accounts first"
        message="Transfers need a source and destination account. Add another account to get started."
      />
    } @else if (transfers().length === 0) {
      <app-empty-state
        icon="arrow-left-right"
        title="No transfers yet"
        message="Move money between your accounts without affecting income or expense totals."
      />
      <div class="empty-actions">
        <button mat-flat-button color="primary" (click)="openAdd()">
          <lucide-icon name="arrow-left-right" />
          Make a transfer
        </button>
      </div>
    } @else {
      <section class="summary app-card">
        <div class="summary-icon"><lucide-icon name="arrow-left-right" /></div>
        <div>
          <div class="micro-label">Transfer history</div>
          <strong>{{ transfers().length }} transfer{{ transfers().length === 1 ? '' : 's' }}</strong>
        </div>
        <span class="summary-note">Excluded from income &amp; expenses</span>
      </section>

      <ul class="transfer-list">
        @for (transfer of transfers(); track transfer.id) {
          <li class="transfer-card app-card">
            <div class="transfer-head">
              <div class="transfer-route">
                <div class="account-icon source"><lucide-icon name="arrow-up-right" /></div>
                <div class="route-copy">
                  <strong>{{ accountLabel(transfer.source_account_id) }}</strong>
                  <span>To {{ accountLabel(transfer.destination_account_id) }}</span>
                </div>
              </div>
              <div class="transfer-amount">{{ transfer.amount | signedMoney }}</div>
            </div>

            <div class="transfer-meta">
              <span><lucide-icon name="calendar" /> {{ transfer.occurred_on | date: 'MMM d, y' : 'UTC' }}</span>
              @if (transfer.notes) {
                <span class="note"><lucide-icon name="sticky-note" /> {{ transfer.notes }}</span>
              }
            </div>

            <div class="transfer-actions">
              <button mat-stroked-button type="button" (click)="openEdit(transfer)">
                <lucide-icon name="pencil" /> Edit
              </button>
              <button
                mat-icon-button
                type="button"
                class="delete-btn"
                aria-label="Delete transfer"
                (click)="confirmDelete(transfer)"
              >
                <lucide-icon name="trash-2" />
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .add-transfer-btn { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--app-ink-dark); color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
      .add-transfer-btn:disabled { opacity: .5; cursor: not-allowed; }
      .add-transfer-btn lucide-icon { width: 17px; height: 17px; }
      .empty-actions { display: flex; justify-content: center; margin-top: 16px; }
      .empty-actions button { border-radius: 999px; }
      .empty-actions lucide-icon { width: 17px; height: 17px; margin-right: 5px; }
      .summary { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 14px 16px; }
      .summary-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 13px; background: var(--app-accent-soft); color: var(--app-accent); }
      .summary-icon lucide-icon { width: 19px; height: 19px; }
      .summary strong { display: block; margin-top: 2px; color: var(--app-ink); font-size: 16px; }
      .summary-note { margin-left: auto; color: var(--app-ink-muted); font-size: 11px; text-align: right; }
      .transfer-list { display: flex; flex-direction: column; gap: 12px; list-style: none; margin: 0; padding: 0; }
      .transfer-card { padding: 16px; }
      .transfer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .transfer-route { display: flex; align-items: center; gap: 11px; min-width: 0; }
      .account-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 12px; background: var(--app-accent-soft); color: var(--app-accent); }
      .account-icon lucide-icon { width: 19px; height: 19px; }
      .route-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .route-copy strong, .route-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .route-copy strong { color: var(--app-ink); font-size: 14px; }
      .route-copy span { color: var(--app-ink-muted); font-size: 12px; }
      .transfer-amount { flex: 0 0 auto; color: var(--app-accent); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .transfer-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 13px; padding-top: 11px; border-top: 1px solid var(--app-hairline); color: var(--app-ink-muted); font-size: 11px; }
      .transfer-meta span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
      .transfer-meta lucide-icon { width: 14px; height: 14px; flex: 0 0 auto; }
      .transfer-meta .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .transfer-actions { display: grid; grid-template-columns: minmax(0, 1fr) 40px; gap: 8px; margin-top: 13px; }
      .transfer-actions button:first-child { min-height: 40px; border-radius: 999px; font-size: 12px; font-weight: 700; }
      .transfer-actions button:first-child lucide-icon { width: 16px; height: 16px; margin-right: 4px; }
      .delete-btn { width: 40px; height: 40px; border-radius: 999px !important; background: var(--app-negative-soft) !important; color: var(--app-negative) !important; }
      .delete-btn lucide-icon { width: 18px; height: 18px; }
      @media (max-width: 480px) {
        .add-transfer-btn span { display: none; }
        .add-transfer-btn { width: 40px; justify-content: center; padding: 0; }
        .summary-note { max-width: 112px; }
        .transfer-head { align-items: flex-start; }
      }
    `,
  ],
})
export class TransfersPage {
  private readonly transfersService = inject(TransfersService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly transfers = this.transfersService.transfers;
  readonly isLoading = this.transfersService.isLoading;
  readonly isAvailable = this.transfersService.isAvailable;
  readonly accounts = this.bankAccountsService.bankAccounts;

  openAdd(): void {
    if (this.accounts().length < 2) {
      this.snack.open('Add at least two bank accounts first.', undefined, { duration: 2500 });
      return;
    }
    this.bottomSheet.open(TransferSheetComponent, { panelClass: 'quick-add-sheet' });
  }

  openEdit(transfer: AccountTransfer): void {
    this.bottomSheet.open(TransferSheetComponent, {
      data: { transfer } satisfies TransferSheetData,
      panelClass: 'quick-add-sheet',
    });
  }

  accountLabel(id: string): string {
    const account = this.accounts().find((item) => item.id === id);
    return account?.account_name || account?.bank_name || 'Unknown account';
  }

  async confirmDelete(transfer: AccountTransfer): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete transfer?',
      message: `This will return ₹${transfer.amount} to the source account and remove both linked ledger entries.`,
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!ok) return;

    try {
      await this.transfersService.delete(transfer.id);
      this.snack.open('Transfer deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errText(error, 'Could not delete the transfer.'), 'Dismiss', { duration: 4000 });
    }
  }
}
