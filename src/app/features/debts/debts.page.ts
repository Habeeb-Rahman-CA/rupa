import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';

import { DebtsService } from '../../core/services/debts.service';
import { PeopleService } from '../../core/services/people.service';
import { Debt } from '../../core/models/domain.models';

import { AddDebtSheetComponent } from './add-debt-sheet.component';
import { PayDebtDialogComponent } from './pay-debt-dialog.component';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';
import { errText } from '../../shared/utils/error-utils';
import { OwedTabsComponent } from '../../shared/components/owed-tabs.component';

@Component({
  selector: 'app-debts-page',
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
    <app-page-header title="People &amp; Balances" subtitle="Track Owed and money held on behalf of others">
      <button
        class="add-btn"
        type="button"
        (click)="openAdd()"
        aria-label="Add debt"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    <app-owed-tabs />

    @if (isLoading() && debts().length === 0) {
      <app-loading-state label="Loading debts…" />
    } @else if (openDebts().length === 0) {
      <app-empty-state
        icon="handshake"
        title="All settled up"
        message="Tap + to record a loan you gave or one you received."
      />
    } @else {
      @if (theyOwe().length > 0) {
        <section class="group">
          <div class="group-head">
            <span class="group-label">They owe you</span>
            <span class="group-total money-positive">
              {{ theyOweTotal() | signedMoney: 'in' }}
            </span>
          </div>
          <ul class="list">
            @for (d of theyOwe(); track d.id) {
              <li class="debt-card app-card">
                <div class="debt-head">
                  <div class="person-info">
                    <div class="avatar" [style.background]="avatarColor(nameFor(d))">
                      {{ initial(nameFor(d)) }}
                    </div>
                    <div class="person-copy">
                      <div class="title">{{ nameFor(d) }}</div>
                      <div class="sub">
                        @if (d.reason) { {{ d.reason }} · }
                        Opened {{ d.opened_on | date: 'MMM d' : 'UTC' }}
                      </div>
                    </div>
                  </div>
                  <div class="debt-balance money-positive">
                    <span class="micro-label">Outstanding</span>
                    <strong>{{ +d.outstanding | signedMoney: 'in' }}</strong>
                  </div>
                </div>
                <div class="debt-actions">
                  <button mat-stroked-button class="debt-action-btn they-owe-btn" (click)="openPay(d)">
                    <lucide-icon name="wallet" /> Record payment
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    class="debt-delete-btn"
                    aria-label="Delete debt"
                    (click)="confirmRemove(d)"
                  >
                    <lucide-icon name="trash-2" style="vertical-align: unset;" />
                  </button>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (youOwe().length > 0) {
        <section class="group">
          <div class="group-head">
            <span class="group-label">You owe</span>
            <span class="group-total money-negative">
              {{ youOweTotal() | signedMoney: 'out' }}
            </span>
          </div>
          <ul class="list">
            @for (d of youOwe(); track d.id) {
              <li class="debt-card app-card">
                <div class="debt-head">
                  <div class="person-info">
                    <div class="avatar" [style.background]="avatarColor(nameFor(d))">
                      {{ initial(nameFor(d)) }}
                    </div>
                    <div class="person-copy">
                      <div class="title">{{ nameFor(d) }}</div>
                      <div class="sub">
                        @if (d.reason) { {{ d.reason }} · }
                        Opened {{ d.opened_on | date: 'MMM d' : 'UTC' }}
                      </div>
                    </div>
                  </div>
                  <div class="debt-balance money-negative">
                    <span class="micro-label">Outstanding</span>
                    <strong>{{ +d.outstanding | signedMoney: 'out' }}</strong>
                  </div>
                </div>
                <div class="debt-actions">
                  <button mat-stroked-button class="debt-action-btn you-owe-btn" (click)="openPay(d)">
                    <lucide-icon name="wallet" /> Record repayment
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    class="debt-delete-btn"
                    aria-label="Delete debt"
                    (click)="confirmRemove(d)"
                  >
                    <lucide-icon name="trash-2" style="vertical-align: unset;" />
                  </button>
                </div>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: [
    `
      .group { margin-bottom: 20px; }
      .group-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 4px 8px;
      }
      .group-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-ink-muted);
      }
      .group-total {
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .debt-card { padding: 16px; }
      .debt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .person-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .person-copy { min-width: 0; }
      .avatar {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 700;
        font-size: 15px;
      }
      .title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .sub { overflow: hidden; color: var(--app-ink-muted); font-size: 12px; margin-top: 2px; text-overflow: ellipsis; white-space: nowrap; }
      .debt-balance { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; }
      .debt-balance strong {
        margin-top: 2px;
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .debt-balance.money-positive strong { color: var(--app-positive); }
      .debt-balance.money-negative strong { color: var(--app-negative); }
      .debt-actions { display: grid; grid-template-columns: minmax(0, 1fr) 40px; gap: 8px; align-items: center; margin-top: 14px; }
      .debt-action-btn {
        min-height: 40px;
        border-radius: 999px !important;
        font-size: 12px;
        font-weight: 700;
      }
      .debt-action-btn.they-owe-btn {
        border-color: var(--app-positive) !important;
        background: var(--app-positive-soft) !important;
        color: var(--app-positive) !important;
      }
      .debt-action-btn.you-owe-btn {
        border-color: var(--app-negative) !important;
        background: var(--app-negative-soft) !important;
        color: var(--app-negative) !important;
      }
      .debt-action-btn.they-owe-btn:hover { background: rgba(22, 163, 74, .2) !important; }
      .debt-action-btn.you-owe-btn:hover { background: rgba(239, 68, 68, .18) !important; }
      .debt-action-btn lucide-icon { width: 16px; height: 16px; margin-right: 4px; }
      .debt-delete-btn {
        width: 40px;
        height: 40px;
        border-radius: 999px !important;
        background: var(--app-negative-soft) !important;
        color: var(--app-negative) !important;
      }
      .debt-delete-btn:hover { background: rgba(239, 68, 68, .18) !important; }
      .debt-delete-btn lucide-icon { width: 18px; height: 18px; }
      @media (max-width: 480px) {
        .debt-head { align-items: flex-start; }
        .debt-balance { padding-top: 2px; }
      }
    `,
  ],
})
export class DebtsPage {
  private readonly debtsService = inject(DebtsService);
  private readonly peopleService = inject(PeopleService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly openDebts = this.debtsService.openDebts;
  readonly debts = this.debtsService.debts;
  readonly isLoading = this.debtsService.isLoading;
  readonly theyOweTotal = this.debtsService.theyOweYouTotal;
  readonly youOweTotal = this.debtsService.youOweTotal;

  readonly theyOwe = computed(() =>
    this.openDebts().filter((d) => d.direction === 'they_owe'),
  );
  readonly youOwe = computed(() =>
    this.openDebts().filter((d) => d.direction === 'i_owe'),
  );

  nameFor(debt: Debt): string {
    return (
      this.peopleService.people().find((p) => p.id === debt.person_id)?.name ??
      'Unknown'
    );
  }

  readonly initial = getInitial;
  readonly avatarColor = getAvatarColor;

  openAdd(): void {
    this.bottomSheet.open(AddDebtSheetComponent);
  }

  openPay(debt: Debt): void {
    this.dialog.open(PayDebtDialogComponent, {
      data: { debt, personName: this.nameFor(debt) },
    });
  }

  async confirmRemove(debt: Debt): Promise<void> {
    const personName = this.nameFor(debt);
    const ok = await openConfirm(this.dialog, {
      title: `Delete debt entry?`,
      message: `Are you sure you want to delete this debt record for ${personName}?`,
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.remove(debt);
    }
  }

  async remove(debt: Debt): Promise<void> {
    try {
      await this.debtsService.delete(debt.id);
      this.snack.open('Debt removed.', undefined, { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t delete — please try again.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }
}
