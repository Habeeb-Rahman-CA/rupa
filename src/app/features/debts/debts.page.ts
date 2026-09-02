import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';

import { DebtsService } from '../../core/services/debts.service';
import { PeopleService } from '../../core/services/people.service';
import { Debt } from '../../core/models/domain.models';

import { AddDebtSheetComponent } from './add-debt-sheet.component';
import { PayDebtDialogComponent } from './pay-debt-dialog.component';

@Component({
  selector: 'app-debts-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatMenuModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header title="Owed" subtitle="Loans and IOUs, in both directions">
      <button
        class="add-btn"
        type="button"
        (click)="openAdd()"
        aria-label="Add debt"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (openDebts().length === 0) {
      <app-empty-state
        icon="handshake"
        title="All settled up"
        message="Tap + to record a loan you gave or one you received."
      />
    } @else {
      <section class="group">
        <div class="group-head">
          <span class="group-label">They owe you</span>
          <span class="group-total money-positive">
            {{ theyOweTotal() | signedMoney: 'in' }}
          </span>
        </div>
        @if (theyOwe().length > 0) {
          <ul class="list app-card-tight">
            @for (d of theyOwe(); track d.id; let last = $last) {
              <li class="row" [class.last]="last">
                <div class="avatar" [style.background]="avatarColor(nameFor(d))">
                  {{ initial(nameFor(d)) }}
                </div>
                <div class="mid">
                  <div class="title">{{ nameFor(d) }}</div>
                  <div class="sub">
                    @if (d.reason) { {{ d.reason }} Â· }
                    Opened {{ d.opened_on | date: 'MMM d' }}
                  </div>
                </div>
                <div class="amount money-positive">
                  {{ +d.outstanding | signedMoney: 'in' }}
                </div>
                <button mat-icon-button [matMenuTriggerFor]="menu">
                  <lucide-icon name="more-vertical" />
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="openPay(d)">
                    <lucide-icon name="wallet" />
                    <span>Record payment</span>
                  </button>
                  <button mat-menu-item (click)="remove(d)">
                    <lucide-icon name="trash-2" />
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </li>
            }
          </ul>
        }
      </section>

      <section class="group">
        <div class="group-head">
          <span class="group-label">You owe</span>
          <span class="group-total money-negative">
            {{ youOweTotal() | signedMoney: 'out' }}
          </span>
        </div>
        @if (youOwe().length > 0) {
          <ul class="list app-card-tight">
            @for (d of youOwe(); track d.id; let last = $last) {
              <li class="row" [class.last]="last">
                <div class="avatar" [style.background]="avatarColor(nameFor(d))">
                  {{ initial(nameFor(d)) }}
                </div>
                <div class="mid">
                  <div class="title">{{ nameFor(d) }}</div>
                  <div class="sub">
                    @if (d.reason) { {{ d.reason }} Â· }
                    Opened {{ d.opened_on | date: 'MMM d' }}
                  </div>
                </div>
                <div class="amount money-negative">
                  {{ +d.outstanding | signedMoney: 'out' }}
                </div>
                <button mat-icon-button [matMenuTriggerFor]="menu2">
                  <lucide-icon name="more-vertical" />
                </button>
                <mat-menu #menu2="matMenu">
                  <button mat-menu-item (click)="openPay(d)">
                    <lucide-icon name="wallet" />
                    <span>Record repayment</span>
                  </button>
                  <button mat-menu-item (click)="remove(d)">
                    <lucide-icon name="trash-2" />
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </li>
            }
          </ul>
        }
      </section>
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
      .list { list-style: none; margin: 0; padding: 0; }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 12px 6px 12px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .row.last { border-bottom: 0; }
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
      .sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
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

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }

  openAdd(): void {
    this.bottomSheet.open(AddDebtSheetComponent);
  }

  openPay(debt: Debt): void {
    this.dialog.open(PayDebtDialogComponent, {
      data: { debt, personName: this.nameFor(debt) },
    });
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

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
