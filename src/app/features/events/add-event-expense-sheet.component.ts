import { Component, computed, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';

import { EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { DateFieldComponent } from '../../shared/components/date-field.component';

export interface AddEventExpenseSheetData {
  eventId: string;
  participants: ParticipantWithMeta[];
}

@Component({
  selector: 'app-add-event-expense-sheet',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    SignedMoneyPipe,
    TextFieldComponent,
    DateFieldComponent,
  ],
  template: `
    <div class="sheet">
      <h2>Add an expense</h2>

      <app-text-field
        label="What was it?"
        placeholder="e.g. Flight tickets, hotel, dinner"
        [maxlength]="80"
        [value]="description()"
        (valueChange)="description.set($any($event) ?? '')"
        [autofocus]="true"
      />

      <div class="two">
        <app-text-field
          class="grow"
          label="Amount"
          placeholder="0.00"
          type="number"
          inputmode="decimal"
          [min]="0"
          [step]="0.01"
          [value]="amount()"
          (valueChange)="amount.set(toNum($event))"
        >
          <span prefix>₹</span>
        </app-text-field>

        <app-date-field
          class="grow"
          label="Paid on"
          [value]="paidOn()"
          (valueChange)="paidOn.set($event)"
        />
      </div>

      <div class="participants-head">
        <label class="ft-label">Split between</label>
        <button mat-button (click)="toggleAll()" type="button">
          {{ allSelected() ? 'Clear' : 'Everyone' }}
        </button>
      </div>
      <ul class="participants">
        @for (p of data.participants; track p.id) {
          <li class="p-row">
            <mat-checkbox
              [checked]="isSelected(p.id)"
              (change)="toggle(p.id, $event.checked)"
            >
              {{ p.name }}
            </mat-checkbox>
          </li>
        }
      </ul>

      @if (perHead() > 0) {
        <div class="per-head">
          Each person pays <strong>{{ perHead() | signedMoney }}</strong>
          ({{ selectedIds().length }} people)
        </div>
      }

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet {
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .two { display: flex; gap: 12px; }
      .grow { flex: 1; min-width: 0; }
      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }
      .participants-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .participants {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--app-hairline);
        border-radius: 12px;
        max-height: 220px;
        overflow: auto;
      }
      .p-row {
        padding: 6px 12px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .p-row:last-child { border-bottom: 0; }
      .per-head {
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
    `,
  ],
})
export class AddEventExpenseSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<AddEventExpenseSheetComponent>);
  private readonly eventsService = inject(EventsService);
  private readonly snack = inject(MatSnackBar);
  readonly data = inject<AddEventExpenseSheetData>(MAT_BOTTOM_SHEET_DATA);

  readonly description = signal('');
  readonly amount = signal<number | null>(null);
  readonly paidOn = signal<Date | null>(new Date());
  readonly submitting = signal(false);
  readonly selectedIds = signal<string[]>(this.data.participants.map((p) => p.id));

  readonly canSave = computed(
    () =>
      this.description().trim().length > 0 &&
      !!this.amount() &&
      this.amount()! > 0 &&
      this.selectedIds().length > 0 &&
      !!this.paidOn(),
  );

  readonly perHead = computed(() => {
    const amt = this.amount() ?? 0;
    const count = this.selectedIds().length;
    return count > 0 ? Math.round((amt / count) * 100) / 100 : 0;
  });

  readonly allSelected = computed(
    () => this.selectedIds().length === this.data.participants.length,
  );

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string, checked: boolean): void {
    const set = new Set(this.selectedIds());
    if (checked) set.add(id); else set.delete(id);
    this.selectedIds.set([...set]);
  }

  toggleAll(): void {
    if (this.allSelected()) this.selectedIds.set([]);
    else this.selectedIds.set(this.data.participants.map((p) => p.id));
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.eventsService.addExpense({
        eventId: this.data.eventId,
        description: this.description(),
        amount: Number(this.amount()),
        paid_on: toIsoDate(this.paidOn()!),
        participantIds: this.selectedIds(),
      });
      this.snack.open('Expense added to the split.', undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
