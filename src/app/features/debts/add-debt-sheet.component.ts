import {
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DebtsService } from '../../core/services/debts.service';
import { PeopleService } from '../../core/services/people.service';
import { DebtDirection } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import {
  SelectFieldComponent,
  SelectOption,
} from '../../shared/components/select-field.component';

const NEW_PERSON = '__new__';

@Component({
  selector: 'app-add-debt-sheet',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    TextFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <div class="sheet">
      <header class="sheet-header">
        <h2>Record a debt</h2>
        <mat-button-toggle-group
          [value]="direction()"
          (change)="direction.set($event.value)"
          hideSingleSelectionIndicator
          class="direction-toggle"
        >
          <mat-button-toggle value="they_owe">They owe you</mat-button-toggle>
          <mat-button-toggle value="i_owe">You owe</mat-button-toggle>
        </mat-button-toggle-group>
      </header>

      <div class="hint">
        @if (direction() === 'they_owe') {
          You gave someone money — we’ll log the expense and remember they owe you back.
        } @else {
          Someone lent you money — we’ll log the income and remember to pay it back.
        }
      </div>

      <app-select-field
        label="Person"
        placeholder="Pick or add"
        [options]="personOptions()"
        [value]="personId()"
        (valueChange)="personId.set($any($event))"
      />

      @if (personId() === NEW_PERSON) {
        <app-text-field
          #newPersonField
          label="New person"
          placeholder="e.g. Ahmed"
          [maxlength]="60"
          [value]="newPersonName()"
          (valueChange)="newPersonName.set($any($event) ?? '')"
        />
      }

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amount.set(toNum($event))"
        (enter)="save()"
      >
        <span prefix>₹</span>
      </app-text-field>

      <app-text-field
        label="Reason (optional)"
        placeholder="e.g. Bike loan, dinner IOU"
        [maxlength]="120"
        [value]="reason()"
        (valueChange)="reason.set($any($event) ?? '')"
      />

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
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .full { width: 100%; }
      .hint {
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .direction-toggle {
        transform: scale(0.9);
        transform-origin: right center;
      }
    `,
  ],
})
export class AddDebtSheetComponent {
  protected readonly NEW_PERSON = NEW_PERSON;

  private readonly ref = inject(MatBottomSheetRef<AddDebtSheetComponent>);
  private readonly debtsService = inject(DebtsService);
  private readonly peopleService = inject(PeopleService);
  private readonly snack = inject(MatSnackBar);

  readonly people = this.peopleService.people;
  readonly personOptions = computed<SelectOption<string>[]>(() => {
    const opts: SelectOption<string>[] = this.people().map((p) => ({
      label: p.name,
      value: p.id,
    }));
    opts.push({ label: 'Other — add new person', value: NEW_PERSON, icon: 'plus' });
    return opts;
  });
  readonly direction = signal<DebtDirection>('they_owe');
  readonly submitting = signal(false);

  readonly personId = signal<string | null>(null);
  readonly newPersonName = signal('');
  readonly amount = signal<number | null>(null);
  readonly reason = signal('');

  @ViewChild('newPersonField')
  private newPersonField?: TextFieldComponent;

  readonly canSave = computed(() => {
    const amt = this.amount();
    if (!amt || amt <= 0) return false;
    const pid = this.personId();
    if (pid === NEW_PERSON) return this.newPersonName().trim().length > 0;
    return !!pid;
  });

  constructor() {
    effect(() => {
      if (this.personId() === NEW_PERSON) {
        queueMicrotask(() => this.newPersonField?.focus());
      }
    });
  }

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      let personId = this.personId();
      if (personId === NEW_PERSON) {
        const created = await this.peopleService.create(this.newPersonName());
        personId = created.id;
      }

      await this.debtsService.create({
        person_id: personId!,
        direction: this.direction(),
        amount: Number(this.amount()),
        reason: this.reason() || null,
      });
      this.snack.open('Debt saved to your ledger.', undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', { duration: 4000 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
