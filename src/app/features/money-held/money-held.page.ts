import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { MoneyHeldTransaction } from '../../core/models/domain.models';
import { MoneyHeldBalance, MoneyHeldService } from '../../core/services/money-held.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';
import { errText } from '../../shared/utils/error-utils';
import { OwedTabsComponent } from '../../shared/components/owed-tabs.component';
import { AddMoneyHeldPersonDialogComponent } from './add-money-held-person-dialog.component';
import {
  RecordMoneyHeldSheetComponent,
  RecordMoneyHeldSheetData,
} from './record-money-held-sheet.component';

@Component({
  selector: 'app-money-held-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
    OwedTabsComponent,
  ],
  template: `
    <app-page-header title="Money Held" subtitle="Money kept on behalf of other people">
      <button class="add-person-btn" type="button" (click)="openAddPerson()">
        <lucide-icon name="plus" />
        <span>Add person</span>
      </button>
    </app-page-header>

    <app-owed-tabs />

    @if (!isAvailable()) {
      <app-empty-state
        icon="info"
        title="Money Held needs setup"
        message="Apply database migration 0008_money_held.sql, then reload the app."
      />
    } @else if (isLoading() && heldPeople().length === 0) {
      <app-loading-state label="Loading money held…" />
    } @else if (heldPeople().length === 0) {
      <app-empty-state
        icon="wallet"
        title="No money held yet"
        message="Add someone, then record money received on their behalf."
      />
      <div class="empty-actions">
        <button mat-flat-button color="primary" (click)="openAddPerson()">
          <lucide-icon name="plus" />
          Add a person
        </button>
      </div>
    } @else {
      <section class="summary app-card">
        <div class="summary-main">
          <div class="summary-icon"><lucide-icon name="wallet" /></div>
          <div>
            <div class="micro-label">Total money held</div>
            <div class="summary-total">{{ totalHeld() | signedMoney }}</div>
          </div>
        </div>
        <div class="summary-count">
          <strong>{{ peopleCount() }}</strong>
          <span>{{ peopleCount() === 1 ? 'person' : 'people' }}</span>
        </div>
      </section>

      @for (balance of balances(); track balance.id) {
        <section class="person-card app-card">
          <div class="person-head">
            <div class="person-info">
              <div class="avatar" [style.background]="avatarColor(balance.name)">
                {{ initial(balance.name) }}
              </div>
              <div>
                <h2>{{ balance.name }}</h2>
                <span class="record-count">
                  {{ balance.records.length }} record{{ balance.records.length === 1 ? '' : 's' }}
                </span>
              </div>
            </div>
            <div class="person-balance" [class.settled]="balance.outstanding <= 0">
              <span class="micro-label">Outstanding</span>
              <strong>{{ balance.outstanding | signedMoney }}</strong>
            </div>
          </div>

          <div class="person-actions">
            <button
              mat-stroked-button
              class="held-action-btn receive-btn"
              (click)="openRecord(balance, 'received')"
            >
              <lucide-icon name="arrow-down" /> Received
            </button>
            <button
              mat-stroked-button
              class="held-action-btn return-btn"
              (click)="openRecord(balance, 'returned')"
              [disabled]="balance.outstanding <= 0"
            >
              <lucide-icon name="arrow-up" /> Return money
            </button>
          </div>

          <div class="history-head">Transaction history</div>
          @if (balance.records.length > 0) {
            <ul class="history-list">
              @for (record of balance.records; track record.id) {
                <li class="history-row">
                  <div class="history-icon" [class.returned]="record.direction === 'returned'">
                    <lucide-icon [name]="record.direction === 'received' ? 'arrow-down' : 'arrow-up'" />
                  </div>
                  <div class="history-main">
                    <div class="history-title">
                      {{ record.direction === 'received' ? 'Money received' : 'Money returned' }}
                    </div>
                    <div class="history-meta">
                      {{ record.occurred_on | date: 'MMM d, y' }} ·
                      {{ record.payment_mode === 'bank' ? 'Bank' : 'Cash' }}
                      @if (record.notes) { · {{ record.notes }} }
                    </div>
                  </div>
                  <div
                    class="history-amount"
                    [class.received]="record.direction === 'received'"
                    [class.returned]="record.direction === 'returned'"
                  >
                    {{ record.amount | signedMoney: (record.direction === 'received' ? 'in' : 'out') }}
                  </div>
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Delete money-held record"
                    (click)="confirmDelete(record)"
                  >
                    <lucide-icon name="trash-2" />
                  </button>
                </li>
              }
            </ul>
          } @else {
            <div class="history-empty">No transactions recorded yet.</div>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .add-person-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: var(--app-ink-dark);
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
      }
      .add-person-btn lucide-icon { width: 17px; height: 17px; }
      .empty-actions { display: flex; justify-content: center; margin-top: 16px; }
      .empty-actions button { border-radius: 999px; }
      .empty-actions lucide-icon { width: 17px; height: 17px; margin-right: 5px; }
      .summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
        padding: 16px 20px;
      }
      .summary-main, .person-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .summary-icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .summary-total { margin-top: 2px; color: var(--app-ink); font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .summary-count { display: flex; flex-direction: column; align-items: flex-end; color: var(--app-ink-muted); font-size: 12px; }
      .summary-count strong { color: var(--app-ink); font-size: 20px; }
      .privacy-note {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0 4px 14px;
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .privacy-note lucide-icon { width: 15px; height: 15px; flex: 0 0 auto; }
      .person-card { margin-bottom: 16px; padding: 16px; }
      .person-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 999px; color: #fff; font-size: 15px; font-weight: 700; flex: 0 0 auto; }
      h2 { margin: 0; color: var(--app-ink); font-size: 15px; font-weight: 700; }
      .record-count { display: block; margin-top: 2px; color: var(--app-ink-muted); font-size: 12px; }
      .person-balance { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; }
      .person-balance strong { margin-top: 2px; color: var(--app-positive); font-size: 17px; font-variant-numeric: tabular-nums; }
      .person-balance.settled strong { color: var(--app-ink-muted); }
      .person-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
      .person-actions button {
        min-width: 0;
        min-height: 40px;
        border-radius: 999px !important;
        font-size: 12px;
        font-weight: 700;
      }
      .person-actions .receive-btn {
        border-color: var(--app-positive) !important;
        background: var(--app-positive-soft) !important;
        color: var(--app-positive) !important;
      }
      .person-actions .return-btn {
        border-color: var(--app-negative) !important;
        background: var(--app-negative-soft) !important;
        color: var(--app-negative) !important;
      }
      .person-actions .receive-btn:hover { background: rgba(22, 163, 74, .2) !important; }
      .person-actions .return-btn:hover:not(:disabled) { background: rgba(239, 68, 68, .18) !important; }
      .person-actions lucide-icon { width: 16px; height: 16px; margin-right: 4px; }
      .history-head { margin-top: 18px; padding-bottom: 8px; border-bottom: 1px solid var(--app-hairline); color: var(--app-ink-muted); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
      .history-list { list-style: none; margin: 0; padding: 0; }
      .history-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto; gap: 9px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--app-hairline); }
      .history-row:last-child { border-bottom: 0; }
      .history-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; background: var(--app-positive-soft); color: var(--app-positive); }
      .history-icon.returned { background: var(--app-negative-soft); color: var(--app-negative); }
      .history-icon lucide-icon { width: 15px; height: 15px; }
      .history-main { min-width: 0; }
      .history-title { color: var(--app-ink); font-size: 13px; font-weight: 600; }
      .history-meta { margin-top: 2px; overflow: hidden; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .history-amount { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .history-amount.received { color: var(--app-positive); }
      .history-amount.returned { color: var(--app-negative); }
      .history-row button { width: 32px; height: 32px; }
      .history-row button lucide-icon { width: 17px; height: 17px; }
      .history-empty { padding: 14px 0 2px; color: var(--app-ink-muted); font-size: 13px; text-align: center; }
      @media (max-width: 480px) {
        .add-person-btn span { display: none; }
        .add-person-btn { width: 40px; justify-content: center; padding: 0; }
        .person-head { align-items: flex-start; }
        .history-row { grid-template-columns: 30px minmax(0, 1fr) auto; }
        .history-row button { grid-column: 3; grid-row: 1; }
        .history-amount { grid-column: 2; grid-row: 2; justify-self: start; }
      }
    `,
  ],
})
export class MoneyHeldPage {
  private readonly moneyHeldService = inject(MoneyHeldService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly heldPeople = this.moneyHeldService.heldPeople;
  readonly balances = this.moneyHeldService.balances;
  readonly totalHeld = this.moneyHeldService.totalHeld;
  readonly peopleCount = this.moneyHeldService.peopleCount;
  readonly isLoading = this.moneyHeldService.isLoading;
  readonly isAvailable = this.moneyHeldService.isAvailable;
  readonly initial = getInitial;
  readonly avatarColor = getAvatarColor;

  openAddPerson(): void {
    this.dialog.open(AddMoneyHeldPersonDialogComponent, { width: '420px' });
  }

  openRecord(balance: MoneyHeldBalance, direction: 'received' | 'returned'): void {
    const data: RecordMoneyHeldSheetData = {
      heldPersonId: balance.id,
      personName: balance.name,
      direction,
    };
    this.bottomSheet.open(RecordMoneyHeldSheetComponent, {
      data,
      panelClass: 'quick-add-sheet',
    });
  }

  async confirmDelete(record: MoneyHeldTransaction): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete money-held record?',
      message: 'The person’s balance will be recalculated from the remaining records.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!ok) return;
    try {
      await this.moneyHeldService.delete(record);
      this.snack.open('Money-held record deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errText(error, 'Couldn’t delete — please try again.'), 'Dismiss', { duration: 4000 });
    }
  }
}
