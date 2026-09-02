import { Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { PeopleService } from '../../core/services/people.service';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import {
  SelectFieldComponent,
  SelectOption,
} from '../../shared/components/select-field.component';
import { AddEventExpenseSheetComponent } from './add-event-expense-sheet.component';

@Component({
  selector: 'app-event-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatMenuModule,
    LucideAngularModule,
    SignedMoneyPipe,
    SelectFieldComponent,
  ],
  template: `
    @let d = detail();
    @if (!d) {
      <div class="loading">Loading…</div>
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

      <ul class="list app-card-tight">
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
        <ul class="list app-card-tight">
          @for (e of d.expenses; track e.id; let last = $last) {
            <li class="row" [class.last]="last">
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
              <button mat-icon-button [matMenuTriggerFor]="eMenu">
                <lucide-icon name="more-vertical" />
              </button>
              <mat-menu #eMenu="matMenu">
                <button mat-menu-item (click)="removeExpense(e.id)">
                  <lucide-icon name="trash-2" />
                  <span>Delete</span>
                </button>
              </mat-menu>
            </li>
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
      if (id) void this.eventsService.loadDetail(id);
    });
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

  async settle(p: ParticipantWithMeta): Promise<void> {
    try {
      await this.eventsService.settleParticipant(p.id);
      this.snack.open(`${p.name} is all settled up.`, undefined, { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t settle — please try again.'), 'Dismiss', { duration: 4000 });
    }
  }

  async unsettle(p: ParticipantWithMeta): Promise<void> {
    try {
      await this.eventsService.unsettleParticipant(p.id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not undo'), 'Dismiss', { duration: 4000 });
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

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }
}

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
