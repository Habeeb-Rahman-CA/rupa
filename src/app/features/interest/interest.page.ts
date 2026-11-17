import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { InterestEntry } from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { InterestService } from '../../core/services/interest.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { OwedTabsComponent } from '../../shared/components/owed-tabs.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { errorText } from '../../shared/utils/error-utils';
import { InterestDialogComponent } from './interest-dialog.component';
import { RecordDisposalDialogComponent } from './record-disposal-dialog.component';
import { RibaGuideDialogComponent } from './riba-guide-dialog.component';

@Component({
  selector: 'app-interest-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    OwedTabsComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SwipeableRowComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header title="Interest" subtitle="Bank interest kept separate from income">
      <button
        class="guide-btn"
        type="button"
        (click)="openGuide()"
        aria-label="Open Riba guide"
        title="Riba guide"
      >
        <lucide-icon name="book-open" />
      </button>
      <button class="add-btn" type="button" (click)="openAdd()" aria-label="Add interest">
        <lucide-icon name="plus" />
        <span>Add interest</span>
      </button>
    </app-page-header>

    <app-owed-tabs />

    @if (!isAvailable()) {
      <app-empty-state
        icon="info"
        title="Interest tracker needs setup"
        message="Apply database migration 0015_interest_tracker.sql, then reload the app."
      />
    } @else if (isLoading() && entries().length === 0) {
      <app-loading-state label="Loading interest…" />
    } @else if (entries().length === 0) {
      <app-empty-state
        icon="percent"
        title="No interest recorded yet"
        message="Log interest your bank actually credits, then dispose of it whenever you give it away. Nothing here is ever counted as income."
      />
      <div class="empty-actions">
        <button mat-flat-button color="primary" (click)="openAdd()">
          <lucide-icon name="plus" /> Add interest
        </button>
      </div>
    } @else {
      <!-- TOTAL INTEREST + REMAINING DISPOSAL BALANCE -->
      <section class="balance-card app-card" aria-label="Interest totals">
        <div class="balance-main">
          <div class="balance-icon"><lucide-icon name="percent" /></div>
          <div class="balance-copy">
            <span class="micro-label">Total interest</span>
            <strong class="balance-total">{{ totalReceived() | signedMoney }}</strong>
          </div>
        </div>
        <div class="balance-side">
          <span class="micro-label">To dispose</span>
          <strong class="balance-pending" [class.is-zero]="pendingBalance() <= 0">{{
            pendingBalance() | signedMoney
          }}</strong>
        </div>
      </section>

      <button
        class="dispose-btn"
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="pendingBalance() <= 0"
        (click)="openDispose()"
      >
        <lucide-icon name="gift" />
        Dispose balance
      </button>

      <!-- INTEREST ENTRIES -->
      <section class="list-head" aria-label="Interest received">
        <h2>Interest received</h2>
        <span class="count"
          >{{ entries().length }} entr{{ entries().length === 1 ? 'y' : 'ies' }}</span
        >
      </section>

      <ul class="entry-list">
        @for (entry of entries(); track entry.id) {
          <app-swipeable-row (delete)="confirmDeleteEntry(entry)">
            <div class="entry-row">
              <div class="entry-icon"><lucide-icon name="percent" /></div>
              <div class="entry-main">
                <h3>{{ bankLabel(entry.bank_account_id) }}</h3>
                <span class="entry-meta">
                  {{ entry.occurred_on | date: 'MMM d, y' }}
                  @if (entry.notes) {
                    · {{ entry.notes }}
                  }
                </span>
                @if (disposedFor(entry) > 0) {
                  <span class="status-chip" [class.done]="remainingFor(entry) <= 0">
                    @if (remainingFor(entry) <= 0) {
                      <lucide-icon name="check" /> Disposed
                    } @else {
                      {{ remainingFor(entry) | signedMoney }} to dispose
                    }
                  </span>
                }
              </div>
              <strong class="entry-amount">{{ entry.amount | signedMoney }}</strong>
            </div>
          </app-swipeable-row>
        }
      </ul>
    }
  `,
  styles: [
    `
      .add-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        /* The global .add-btn rule is an icon button (width: 40px); this
           page has a labelled pill, so opt out of that fixed width. */
        width: auto;
        height: 40px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: var(--app-ink-dark);
        color: var(--mat-sys-on-primary);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
      }
      .add-btn lucide-icon {
        width: 17px;
        height: 17px;
      }
      .guide-btn {
        display: inline-grid;
        place-items: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 1px solid var(--app-hairline);
        border-radius: 999px;
        background: var(--app-surface);
        color: var(--app-ink-muted);
        cursor: pointer;
      }
      .guide-btn:hover {
        color: var(--app-accent);
        border-color: var(--app-accent);
      }
      .guide-btn lucide-icon {
        width: 17px;
        height: 17px;
      }
      .empty-actions {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      .empty-actions button {
        border-radius: 999px;
      }
      .empty-actions lucide-icon {
        width: 17px;
        height: 17px;
        margin-right: 5px;
      }

      /* Totals */
      .balance-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 12px;
        padding: 16px;
      }
      .balance-main {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .balance-icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: 13px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .balance-icon lucide-icon {
        width: 19px;
        height: 19px;
      }
      .balance-copy {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .balance-total {
        color: var(--app-ink);
        font-size: 24px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .balance-side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 3px;
        flex: 0 0 auto;
      }
      .balance-pending {
        color: var(--app-ink);
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .balance-pending.is-zero {
        color: var(--app-ink-muted);
        font-weight: 600;
      }

      .dispose-btn {
        width: 100%;
        height: 44px;
        margin: 0 0 16px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
      }
      .dispose-btn lucide-icon {
        width: 17px;
        height: 17px;
        margin-right: 7px;
      }
      .dispose-btn:disabled {
        opacity: 0.5;
      }

      /* Entries */
      .list-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin: 4px 4px 10px;
      }
      .list-head h2 {
        margin: 0;
        color: var(--app-ink);
        font-size: 15px;
        font-weight: 700;
      }
      .list-head .count {
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .entry-list {
        list-style: none;
        margin: 0 0 16px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .entry-row {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
      .entry-icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: 13px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .entry-icon lucide-icon {
        width: 19px;
        height: 19px;
      }
      .entry-main {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .entry-main h3 {
        margin: 0;
        overflow: hidden;
        color: var(--app-ink);
        font-size: 15px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .entry-meta {
        display: block;
        overflow: hidden;
        color: var(--app-ink-muted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status-chip {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        gap: 4px;
        margin-top: 3px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .status-chip.done {
        background: var(--app-positive-soft, rgba(16, 163, 127, 0.12));
        color: var(--app-positive);
      }
      .status-chip lucide-icon {
        width: 11px;
        height: 11px;
      }
      .entry-amount {
        color: var(--app-positive);
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      @media (max-width: 640px) {
        .add-btn span {
          display: none;
        }
        .add-btn {
          width: 40px;
          justify-content: center;
          padding: 0;
        }
      }
      @media (max-width: 480px) {
        .balance-card {
          padding: 14px;
        }
        .balance-total {
          font-size: 21px;
        }
        .balance-pending {
          font-size: 15px;
        }
        .entry-amount {
          font-size: 16px;
        }
      }
    `,
  ],
})
export class InterestPage {
  private readonly interestService = inject(InterestService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly entries = this.interestService.entries;
  readonly isLoading = this.interestService.isLoading;
  readonly isAvailable = this.interestService.isAvailable;
  readonly totalReceived = this.interestService.totalReceived;
  readonly pendingBalance = this.interestService.pendingBalance;

  bankLabel(bankAccountId: string): string {
    const account = this.bankAccountsService
      .bankAccounts()
      .find((item) => item.id === bankAccountId);
    return account?.bank_name || 'Bank account';
  }

  disposedFor(entry: InterestEntry): number {
    return this.interestService.disposedForEntry(entry.id);
  }

  remainingFor(entry: InterestEntry): number {
    return this.interestService.remainingForEntry(entry);
  }

  openAdd(): void {
    this.dialog.open(InterestDialogComponent, {
      width: 'min(520px, calc(100vw - 24px))',
    });
  }

  openGuide(): void {
    this.dialog.open(RibaGuideDialogComponent, {
      width: 'min(560px, calc(100vw - 24px))',
    });
  }

  openDispose(): void {
    this.dialog.open(RecordDisposalDialogComponent, {
      width: 'min(520px, calc(100vw - 24px))',
    });
  }

  async confirmDeleteEntry(entry: InterestEntry): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete this interest entry?',
      message:
        'Only this tracker record is removed — no personal transactions or balances are affected. Its disposal records are deleted with it.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!ok) return;
    try {
      await this.interestService.deleteEntry(entry.id);
      this.snack.open('Interest entry deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t delete the entry.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }
}
