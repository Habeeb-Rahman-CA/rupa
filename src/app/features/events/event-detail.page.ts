import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LucideAngularModule } from 'lucide-angular';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExpenseWithParticipants, EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { PeopleService } from '../../core/services/people.service';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import {
  SelectFieldComponent,
  SelectOption,
} from '../../shared/components/select-field.component';
import { AddEventExpenseSheetComponent } from './add-event-expense-sheet.component';
import { SettleParticipantDialogComponent } from './settle-participant-dialog.component';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';
import { errText } from '../../shared/utils/error-utils';

@Component({
  selector: 'app-event-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    LucideAngularModule,
    SignedMoneyPipe,
    SelectFieldComponent,
    SwipeableRowComponent,
    EmptyStateComponent,
  ],
  template: `
    @let d = detail();
    @if (error()) {
      <div class="error-container">
        <app-empty-state
          icon="alert-triangle"
          title="Could not load event split"
          [message]="error()!"
        />
        <div class="error-actions">
          <button mat-flat-button color="primary" (click)="loadDetail(id())">
            <lucide-icon name="refresh-cw" />
            <span>Try Again</span>
          </button>
          <a mat-button routerLink="/events" class="back-link">
            <lucide-icon name="arrow-left" />
            <span>Back to splits</span>
          </a>
        </div>
      </div>
    } @else if (!d) {
      <div class="loading app-card">
        <mat-spinner diameter="32" />
        <span>Loading event details…</span>
      </div>
    } @else {
      <header class="detail-header">
        <a mat-icon-button routerLink="/events" aria-label="Back">
          <lucide-icon name="arrow-left" />
        </a>
        <div class="title-wrap">
          <h1>{{ d.event.name }}</h1>
          <p class="meta">
            {{ d.event.starts_on | date: 'MMM d, y' }}
            @if (d.event.ends_on) { – {{ d.event.ends_on | date: 'MMM d, y' }} }
          </p>
        </div>
        <span
          class="status-pill"
          [class.settled]="d.event.status === 'settled'"
        >
          {{ d.event.status === 'settled' ? 'Settled' : 'Open' }}
        </span>
        <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Event actions">
          <lucide-icon name="more-vertical" />
        </button>
        <mat-menu #menu="matMenu">
          @if (d.event.status === 'open') {
            <button mat-menu-item (click)="close()">
              <lucide-icon name="check-circle" />
              <span>Mark settled</span>
            </button>
          } @else {
            <button mat-menu-item (click)="reopen()">
              <lucide-icon name="lock-open" />
              <span>Reopen</span>
            </button>
          }
          <button mat-menu-item (click)="deleteEvent()">
            <lucide-icon name="trash-2" />
            <span>Delete</span>
          </button>
        </mat-menu>
      </header>

      <!-- Hero stats -->
      <section class="hero app-card">
        <div class="hero-row">
          <div class="stat">
            <div class="micro-label">You paid</div>
            <div class="stat-value money-negative">
              {{ d.totalSpent | signedMoney: 'out' }}
            </div>
          </div>
          <div class="v-divider"></div>
          <div class="stat">
            <div class="micro-label">Left to collect</div>
            <div class="stat-value money-positive">
              {{ d.totalOutstanding | signedMoney: 'in' }}
            </div>
          </div>
        </div>
      </section>

      <!-- Participants -->
      <div class="section-head">
        <h2>Participants</h2>
        @if (availableToAdd().length > 0) {
          <app-select-field
            class="add-p-field"
            placeholder="Add"
            [options]="availableToAddOptions()"
            [value]="null"
            (valueChange)="onAddParticipant($any($event))"
          />
        }
      </div>

      <ul class="list-users">
        @for (p of d.participants; track p.id; let last = $last) {
          <li class="row" [class.last]="last">
            <div class="avatar" [style.background]="avatarColor(p.name)">
              {{ initial(p.name) }}
            </div>
            <div class="mid">
              <div class="title">{{ p.name }}</div>
              <div class="sub">
                @if (p.isYou) {
                  Your share is covered
                } @else if (p.isSettled) {
                  <span class="settled">Settled up</span>
                } @else if (p.totalShare > 0) {
                  Owes you {{ p.totalShare | signedMoney }}
                } @else {
                  Hasn’t joined any expense yet
                }
              </div>
            </div>
            @if (!p.isYou) {
              <button mat-icon-button [matMenuTriggerFor]="pMenu">
                <lucide-icon name="more-vertical" />
              </button>
              <mat-menu #pMenu="matMenu">
                @if (!p.isSettled && p.totalShare > 0) {
                  <button mat-menu-item (click)="settle(p)">
                    <lucide-icon name="wallet" />
                    <span>Settle full ({{ p.totalShare | signedMoney }})</span>
                  </button>
                }
                @if (p.isSettled) {
                  <button mat-menu-item (click)="unsettle(p)">
                    <lucide-icon name="undo-2" />
                    <span>Undo settlement</span>
                  </button>
                }
                @if (p.totalShare === 0) {
                  <button mat-menu-item (click)="removeParticipant(p)">
                    <lucide-icon name="user-minus" />
                    <span>Remove</span>
                  </button>
                }
              </mat-menu>
            }
          </li>
        }
      </ul>

      <!-- Expenses -->
      <div class="section-head">
        <h2>Expenses</h2>
        <button
          class="add-btn"
          type="button"
          (click)="openAddExpense()"
          aria-label="Add expense"
        >
          <lucide-icon name="plus" />
        </button>
      </div>

      @if (d.expenses.length === 0) {
        <div class="app-card placeholder">
          No expenses on this split yet. Tap <strong>+</strong> to add one.
        </div>
      } @else {
        <ul class="list">
          @for (e of d.expenses; track e.id) {
            <app-swipeable-row (delete)="confirmDeleteExpense(e)">
              <div class="row">
                <div class="e-icon" [style.background]="avatarColor(e.description)">
                  <lucide-icon name="receipt" />
                </div>
                <div class="mid">
                  <div class="title">{{ e.description }}</div>
                  <div class="sub">
                    {{ e.paidOn | date: 'MMM d' }} ·
                    {{ e.participantIds.length }} people ·
                    {{ e.perHead | signedMoney }} each
                  </div>
                </div>
                <div class="amount money-negative">
                  {{ e.amount | signedMoney: 'out' }}
                </div>
              </div>
            </app-swipeable-row>
          }
        </ul>
      }
    }
  `,
  styles: [
    `
      .loading {
        color: var(--app-ink-muted);
        padding: 40px;
        text-align: center;
      }

      /* ---------- Detail header --------------------------------------- */
      .detail-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 4px 0 16px;
      }
      .title-wrap {
        flex: 1;
        min-width: 0;
        margin: 0 4px;
      }
      .title-wrap h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--app-ink);
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .status-pill {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .status-pill.settled {
        background: var(--app-positive-soft);
        color: var(--app-positive);
      }

      /* ---------- Hero card ------------------------------------------- */
      .hero { padding: 20px; }
      .hero-row {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 16px;
        align-items: center;
      }
      .stat { text-align: center; }
      .stat-value {
        margin-top: 6px;
        font-size: 22px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .v-divider {
        width: 1px;
        height: 36px;
        background: var(--app-hairline);
      }

      /* ---------- Section head + list --------------------------------- */
      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin: 24px 4px 10px;
      }
      .section-head h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--app-ink);
      }
      .add-p-field ::ng-deep .mat-mdc-form-field {
        width: 140px;
      }

      .list {
        list-style: none;
        margin: 0 0 18px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .list-users {
        list-style: none;
        margin: 0 0 18px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
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
      .e-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .e-icon lucide-icon {
        width: 22px;
        height: 22px;
      }
      .title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .settled { color: var(--app-positive); font-weight: 500; }
      .placeholder {
        color: var(--app-ink-muted);
        text-align: center;
        font-size: 14px;
      }
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px 20px;
        color: var(--app-ink-muted);
        font-weight: 500;
        font-size: 14px;
      }
      .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 24px 0;
      }
      .error-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .error-actions button, .error-actions a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: var(--app-radius-md);
      }
    `,
  ],
})
export class EventDetailPage {
  private readonly eventsService = inject(EventsService);
  private readonly peopleService = inject(PeopleService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly detail = this.eventsService.currentDetail;
  readonly error = signal<string | null>(null);

  readonly availableToAdd = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const existing = new Set(d.participants.map((p) => p.personId).filter(Boolean));
    return this.peopleService.people().filter((p) => !existing.has(p.id));
  });

  readonly availableToAddOptions = computed<SelectOption<string>[]>(() =>
    this.availableToAdd().map((p) => ({ label: p.name, value: p.id })),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.loadDetail(id);
    });
  }

  async loadDetail(id: string): Promise<void> {
    this.error.set(null);
    try {
      await this.eventsService.loadDetail(id);
      if (!this.detail()) {
        this.error.set('Event split not found or may have been deleted.');
      }
    } catch (e: unknown) {
      this.error.set(errText(e, 'Failed to load event details.'));
    }
  }

  openAddExpense(): void {
    const d = this.detail();
    if (!d) return;
    this.bottomSheet.open(AddEventExpenseSheetComponent, {
      data: { eventId: d.event.id, participants: d.participants },
    });
  }

  async onAddParticipant(personId: string | null): Promise<void> {
    if (!personId) return;
    const d = this.detail();
    if (!d) return;
    try {
      await this.eventsService.addParticipant(d.event.id, personId);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not add participant'), 'Dismiss', { duration: 4000 });
    }
  }

  async removeParticipant(p: ParticipantWithMeta): Promise<void> {
    try {
      await this.eventsService.removeParticipant(p.id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not remove participant'), 'Dismiss', { duration: 4000 });
    }
  }

  settle(p: ParticipantWithMeta): void {
    this.dialog.open(SettleParticipantDialogComponent, {
      width: '400px',
      data: { participant: p },
    });
  }

  async unsettle(p: ParticipantWithMeta): Promise<void> {
    try {
      await this.eventsService.unsettleParticipant(p.id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not undo'), 'Dismiss', { duration: 4000 });
    }
  }

  async confirmDeleteExpense(e: ExpenseWithParticipants): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: `Delete "${e.description}"?`,
      message: 'Are you sure you want to delete this split expense?',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.removeExpense(e.id);
    }
  }

  async removeExpense(id: string): Promise<void> {
    try {
      await this.eventsService.removeExpense(id);
      this.snack.open('Expense deleted.', undefined, { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not delete expense'), 'Dismiss', { duration: 4000 });
    }
  }

  async close(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    try {
      await this.eventsService.setStatus(d.event.id, 'settled');
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not update status'), 'Dismiss', { duration: 4000 });
    }
  }

  async reopen(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    try {
      await this.eventsService.setStatus(d.event.id, 'open');
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not update status'), 'Dismiss', { duration: 4000 });
    }
  }

  async deleteEvent(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const ok = await openConfirm(this.dialog, {
      title: `Delete "${d.event.name}"?`,
      message: 'This wipes every expense and settlement in this split from your ledger. This can’t be undone.',
      confirmLabel: 'Delete split',
      destructive: true,
      icon: 'trash-2',
    });
    if (!ok) return;
    try {
      await this.eventsService.delete(d.event.id);
      this.router.navigate(['/events']);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not delete event'), 'Dismiss', { duration: 4000 });
    }
  }

  readonly initial = getInitial;
  readonly avatarColor = getAvatarColor;
}
