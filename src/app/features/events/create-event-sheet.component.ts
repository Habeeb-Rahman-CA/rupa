import {
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';

import { EventsService } from '../../core/services/events.service';
import { PeopleService } from '../../core/services/people.service';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { DateFieldComponent } from '../../shared/components/date-field.component';

@Component({
  selector: 'app-create-event-sheet',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    LucideAngularModule,
    MatChipsModule,
    TextFieldComponent,
    DateFieldComponent,
  ],
  template: `
    <div class="sheet">
      <h2>Start a new split</h2>

      <app-text-field
        label="Name"
        placeholder="e.g. Goa trip, house dinner"
        [maxlength]="80"
        [value]="name()"
        (valueChange)="name.set($any($event) ?? '')"
        [autofocus]="true"
      />

      <div class="date-row">
        <app-date-field
          class="grow"
          label="Starts"
          [value]="startsOn()"
          (valueChange)="startsOn.set($event)"
        />
        <app-date-field
          class="grow"
          label="Ends (optional)"
          placeholder="—"
          [value]="endsOn()"
          (valueChange)="endsOn.set($event)"
        />
      </div>

      <div>
        <label class="ft-label">Participants (besides you)</label>
        <mat-chip-listbox
          multiple
          [ngModel]="selectedIds()"
          (ngModelChange)="selectedIds.set($event)"
        >
          @for (p of people(); track p.id) {
            <mat-chip-option [value]="p.id">{{ p.name }}</mat-chip-option>
          }
        </mat-chip-listbox>
      </div>

      <app-text-field
        #newPersonField
        label="Add someone new"
        placeholder="Type a name and press Enter"
        [maxlength]="60"
        [value]="newPersonName()"
        (valueChange)="newPersonName.set($any($event) ?? '')"
        (enter)="addNewPerson()"
      >
        <button
          suffix
          class="add-person-btn"
          aria-label="Add person"
          (click)="addNewPerson()"
          [disabled]="!newPersonName().trim()"
          type="button"
        >
          <lucide-icon name="plus" />
        </button>
      </app-text-field>

      <app-text-field
        label="Note (optional)"
        placeholder="Where, when, or anything else you'd remember"
        [maxlength]="200"
        [value]="notes()"
        (valueChange)="notes.set($any($event) ?? '')"
      />

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Creating…' : 'Create' }}
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
      .date-row {
        display: flex;
        gap: 12px;
      }
      .grow { flex: 1; min-width: 0; }
      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }
      .add-person-btn {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: var(--app-accent);
        color: #fff;
        display: unset !important;
        place-items: center;
        cursor: pointer;

        &:disabled { opacity: 0.4; cursor: default; }
        lucide-icon { width: 16px; height: 16px; }
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
export class CreateEventSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<CreateEventSheetComponent>);
  private readonly eventsService = inject(EventsService);
  private readonly peopleService = inject(PeopleService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly people = this.peopleService.people;

  readonly name = signal('');
  readonly startsOn = signal<Date | null>(new Date());
  readonly endsOn = signal<Date | null>(null);
  readonly notes = signal('');
  readonly selectedIds = signal<string[]>([]);
  readonly newPersonName = signal('');
  readonly submitting = signal(false);

  @ViewChild('newPersonField') private newPersonField?: TextFieldComponent;

  readonly canSave = computed(
    () => this.name().trim().length > 0 && !!this.startsOn(),
  );

  async addNewPerson(): Promise<void> {
    const nm = this.newPersonName().trim();
    if (!nm) return;
    try {
      const created = await this.peopleService.create(nm);
      this.selectedIds.set([...this.selectedIds(), created.id]);
      this.newPersonName.set('');
      this.newPersonField?.focus();
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Could not add person'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const evt = await this.eventsService.create({
        name: this.name(),
        starts_on: toIsoDate(this.startsOn()!),
        ends_on: this.endsOn() ? toIsoDate(this.endsOn()!) : null,
        notes: this.notes() || null,
        participantPersonIds: this.selectedIds(),
      });
      this.snack.open('Split created — start adding expenses.', undefined, { duration: 2500 });
      this.ref.dismiss({ saved: true });
      this.router.navigate(['/events', evt.id]);
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Could not create event.'), 'Dismiss', {
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
