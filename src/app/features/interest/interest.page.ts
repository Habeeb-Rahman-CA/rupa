import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { InterestEntry } from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { InterestPeriodSummary, InterestService } from '../../core/services/interest.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { OwedTabsComponent } from '../../shared/components/owed-tabs.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { errorText } from '../../shared/utils/error-utils';
import { InterestDialogComponent } from './interest-dialog.component';
import { RecordDisposalDialogComponent } from './record-disposal-dialog.component';

const STAGE_META: Record<InterestEntry['stage'], { label: string; icon: string }> = {
  received: { label: 'Received', icon: 'landmark' },
  separated: { label: 'Separated', icon: 'clock' },
  disposed: { label: 'Disposed', icon: 'gift' },
};

@Component({
  selector: 'app-interest-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    PageHeaderComponent,
    OwedTabsComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header
      title="Interest"
      subtitle="Bank interest kept separate from income"
    >
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
        message="Log interest your bank actually credits, mark it separated, and record where it was disposed. Nothing here is ever counted as income."
      />
      <div class="empty-actions">
        <button mat-flat-button color="primary" (click)="openAdd()">
          <lucide-icon name="plus" /> Add interest
        </button>
      </div>
    } @else {
      <!-- MONTHLY / YEARLY SUMMARIES -->
      <section class="summary-card app-card" aria-label="Interest summaries">
        <div class="section-heading">
          <div>
            <span class="micro-label">Summaries</span>
            <h2>Monthly &amp; yearly</h2>
          </div>
          <mat-button-toggle-group
            [value]="summaryMode()"
            (change)="summaryMode.set($event.value)"
            hideSingleSelectionIndicator
            class="summary-toggle"
          >
            <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
            <mat-button-toggle value="yearly">Yearly</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <div class="period-head">
          <span>Period</span>
          <span>Received</span>
          <span>Disposed</span>
          <span>Pending</span>
        </div>
        <ul class="period-list">
          @for (row of summaryRows(); track row.key) {
            <li class="period-row">
              <span class="period-label">{{ row.label }}</span>
              <span class="period-value">{{ row.received | signedMoney }}</span>
              <span class="period-value disposed">{{ row.disposed | signedMoney }}</span>
              <span class="period-value pending">{{ row.pending | signedMoney }}</span>
            </li>
          } @empty {
            <li class="period-empty">No periods yet.</li>
          }
        </ul>
      </section>

      <!-- INTEREST ENTRIES — each card is its own history (stage + progress) -->
      <section class="list-head" aria-label="Interest received">
        <h2>Interest received</h2>
        <span class="count">{{ entries().length }} entr{{ entries().length === 1 ? 'y' : 'ies' }}</span>
      </section>

      @for (entry of entries(); track entry.id) {
        <article class="entry-card app-card">
          <div class="entry-head">
            <div class="entry-icon"><lucide-icon name="percent" /></div>
            <div class="entry-main">
              <h3>{{ bankLabel(entry.bank_account_id) }}</h3>
              <span class="entry-meta">
                {{ entry.occurred_on | date: 'MMM d, y' }}
                @if (entry.notes) { · {{ entry.notes }} }
                @if (entry.separated_on; as separatedOn) {
                  · separated {{ separatedOn | date: 'MMM d, y' }}
                }
              </span>
            </div>
            <div class="entry-right">
              <strong class="entry-amount">{{ entry.amount | signedMoney }}</strong>
              <span class="stage-badge" [attr.data-stage]="entry.stage">
                <lucide-icon [name]="stageMeta(entry).icon" />
                {{ stageMeta(entry).label }}
              </span>
            </div>
          </div>

          @if (disposedFor(entry) > 0) {
            <div class="progress-line">
              <div
                class="progress-fill"
                [style.width.%]="progressPercent(entry)"
                [class.fully-disposed]="remainingFor(entry) <= 0"
              ></div>
            </div>
            <div class="progress-copy">
              {{ disposedFor(entry) | signedMoney }} disposed of {{ entry.amount | signedMoney }}
              @if (remainingFor(entry) > 0) {
                · ₹{{ remainingFor(entry).toFixed(2) }} pending
              }
            </div>
          }

          <div class="entry-actions">
            @if (entry.stage === 'received') {
              <button
                mat-stroked-button
                type="button"
                class="entry-btn separate-btn"
                (click)="markSeparated(entry)"
              >
                <lucide-icon name="check" /> Separate
              </button>
            }
            @if (remainingFor(entry) > 0 && entry.stage !== 'disposed') {
              <button
                mat-stroked-button
                type="button"
                class="entry-btn dispose-btn"
                (click)="openDispose(entry)"
              >
                <lucide-icon name="gift" /> Dispose
              </button>
            }
            <button
              mat-icon-button
              type="button"
              class="delete-btn"
              aria-label="Delete interest entry"
              (click)="confirmDeleteEntry(entry)"
            >
              <lucide-icon name="trash-2" />
            </button>
          </div>
        </article>
      }

      <p class="privacy-note">
        <lucide-icon name="shield-check" />
        Interest is tracked outside your personal ledger — it never counts as income,
        expense, or savings, and never affects budgets or reports.
      </p>
    }
  `,
  styles: [
    `
      .add-btn {
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
      .add-btn lucide-icon { width: 17px; height: 17px; }
      .empty-actions { display: flex; justify-content: center; margin-top: 16px; }
      .empty-actions button { border-radius: 999px; }
      .empty-actions lucide-icon { width: 17px; height: 17px; margin-right: 5px; }

      /* Summaries */
      .summary-card { margin-bottom: 18px; padding: 16px; }
      .section-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .section-heading h2, .list-head h2 {
        margin: 2px 0 0;
        color: var(--app-ink);
        font-size: 15px;
        font-weight: 700;
      }
      .summary-toggle { flex: 0 0 auto; transform: scale(.9); transform-origin: right top; }
      .period-head, .period-row {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) repeat(3, minmax(0, 1fr));
        gap: 8px;
        align-items: center;
      }
      .period-head {
        padding: 0 2px 7px;
        border-bottom: 1px solid var(--app-hairline);
        color: var(--app-ink-muted);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .06em;
        text-transform: uppercase;
      }
      .period-head span:not(:first-child), .period-value { text-align: right; }
      .period-list { list-style: none; margin: 0; padding: 0; }
      .period-row { padding: 9px 2px; border-bottom: 1px solid var(--app-hairline); }
      .period-row:last-child { border-bottom: 0; }
      .period-label { overflow: hidden; color: var(--app-ink); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .period-value { color: var(--app-ink); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .period-value.disposed { color: var(--app-positive); }
      .period-value.pending { color: #b43403; font-weight: 700; }
      .period-empty { padding: 12px 0 2px; color: var(--app-ink-muted); font-size: 13px; text-align: center; }

      /* Entries */
      .list-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin: 4px 4px 10px;
      }
      .list-head .count { color: var(--app-ink-muted); font-size: 12px; }
      .entry-card { margin-bottom: 12px; padding: 16px; }
      .entry-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
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
      .entry-icon lucide-icon { width: 19px; height: 19px; }
      .entry-main { min-width: 0; flex: 1 1 auto; }
      .entry-main h3 { margin: 0; overflow: hidden; color: var(--app-ink); font-size: 15px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .entry-meta { display: block; margin-top: 2px; overflow: hidden; color: var(--app-ink-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .entry-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: 0 0 auto; }
      .entry-amount { color: var(--app-ink); font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .stage-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .stage-badge lucide-icon { width: 11px; height: 11px; }
      .stage-badge[data-stage='separated'] { background: rgba(99, 102, 241, .12); color: #3f4bb8; }
      .stage-badge[data-stage='disposed'] { background: var(--app-positive-soft, rgba(16, 163, 127, .12)); color: var(--app-positive); }
      .progress-line { height: 6px; margin-top: 13px; overflow: hidden; border-radius: 999px; background: var(--app-input-bg); }
      .progress-fill { height: 100%; border-radius: 999px; background: var(--app-accent); transition: width .25s ease; }
      .progress-fill.fully-disposed { background: var(--app-positive); }
      .progress-copy { margin-top: 6px; color: var(--app-ink-muted); font-size: 11px; font-variant-numeric: tabular-nums; }

      /* Compact single-row actions: Separate · Dispose · Delete */
      .entry-actions { display: flex; flex-wrap: nowrap; gap: 6px; margin-top: 12px; }
      .entry-actions .entry-btn {
        min-height: 32px;
        min-width: 0;
        padding: 0 11px;
        border-radius: 999px !important;
        font-size: 11.5px;
        font-weight: 700;
        line-height: 1;
      }
      .entry-actions lucide-icon { width: 14px; height: 14px; margin-right: 4px; }
      .separate-btn {
        border-color: var(--app-accent) !important;
        color: var(--app-accent) !important;
      }
      .dispose-btn {
        border-color: var(--app-positive) !important;
        color: var(--app-positive) !important;
      }
      .entry-actions .delete-btn {
        margin-left: auto;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        color: var(--app-ink-muted);
      }
      .entry-actions .delete-btn lucide-icon { width: 16px; height: 16px; margin: 0; }

      .privacy-note {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0 4px 8px;
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .privacy-note lucide-icon { width: 15px; height: 15px; flex: 0 0 auto; }

      @media (max-width: 640px) {
        .add-btn span { display: none; }
        .add-btn { width: 40px; justify-content: center; padding: 0; }
      }
      @media (max-width: 480px) {
        .entry-head { align-items: flex-start; }
        /* Keep the column header visible on phones — just tighter. */
        .period-head { font-size: 9px; letter-spacing: .03em; }
        .period-row { font-size: 11px; }
        .period-label { font-size: 12px; }
        .period-value { font-size: 11px; }
        .entry-actions .entry-btn { padding: 0 9px; font-size: 11px; }
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
  readonly monthlySummaries = this.interestService.monthlySummaries;
  readonly yearlySummaries = this.interestService.yearlySummaries;

  readonly summaryMode = signal<'monthly' | 'yearly'>('monthly');

  readonly summaryRows = computed<InterestPeriodSummary[]>(() =>
    this.summaryMode() === 'monthly' ? this.monthlySummaries() : this.yearlySummaries(),
  );

  bankLabel(bankAccountId: string): string {
    const account = this.bankAccountsService
      .bankAccounts()
      .find((item) => item.id === bankAccountId);
    return account ? `${account.bank_name} · ${account.account_name}` : 'Bank account';
  }

  stageMeta(entry: InterestEntry): { label: string; icon: string } {
    return STAGE_META[entry.stage] ?? STAGE_META.received;
  }

  disposedFor(entry: InterestEntry): number {
    return this.interestService.disposedForEntry(entry.id);
  }

  remainingFor(entry: InterestEntry): number {
    return this.interestService.remainingForEntry(entry);
  }

  progressPercent(entry: InterestEntry): number {
    const amount = Number(entry.amount);
    if (!(amount > 0)) return 0;
    return Math.min(100, (this.disposedFor(entry) / amount) * 100);
  }

  openAdd(): void {
    this.dialog.open(InterestDialogComponent, {
      width: 'min(520px, calc(100vw - 24px))',
    });
  }

  openDispose(entry: InterestEntry): void {
    this.dialog.open(RecordDisposalDialogComponent, {
      width: 'min(520px, calc(100vw - 24px))',
      data: { entry },
    });
  }

  async markSeparated(entry: InterestEntry): Promise<void> {
    try {
      await this.interestService.markSeparated(entry.id);
      this.snack.open('Interest marked as separated.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t update the entry.'), 'Dismiss', {
        duration: 4000,
      });
    }
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
