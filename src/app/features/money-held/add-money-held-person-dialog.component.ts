import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MoneyHeldService } from '../../core/services/money-held.service';
import { PeopleService } from '../../core/services/people.service';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';

const NEW_PERSON = '__new__';

@Component({
  selector: 'app-add-money-held-person-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, SelectFieldComponent, TextFieldComponent],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div>
          <h2 mat-dialog-title class="dialog-title">Add money-held person</h2>
          <p class="dialog-subtitle">Choose someone whose money you keep for them.</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <app-select-field
          label="Person"
          placeholder="Choose a person"
          [options]="personOptions()"
          [value]="personId()"
          (valueChange)="personId.set($any($event))"
        />

        @if (personId() === NEW_PERSON) {
          <app-text-field
            label="New person"
            placeholder="e.g. Ahmed"
            [maxlength]="60"
            [value]="newPersonName()"
            (valueChange)="newPersonName.set($any($event) ?? '')"
            (enter)="save()"
            [autofocus]="true"
          />
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Add person' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        max-width: 480px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }
      .dialog-header {
        padding: 0 16px 12px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .dialog-title {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
      }
      .dialog-subtitle {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
      }
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 300px;
        padding-top: 16px !important;
        padding-bottom: 16px !important;
      }
      .dialog-actions { padding-top: 12px; }
    `,
  ],
})
export class AddMoneyHeldPersonDialogComponent {
  private readonly ref = inject(MatDialogRef<AddMoneyHeldPersonDialogComponent>);
  private readonly peopleService = inject(PeopleService);
  private readonly moneyHeldService = inject(MoneyHeldService);
  private readonly snack = inject(MatSnackBar);

  protected readonly NEW_PERSON = NEW_PERSON;
  readonly personId = signal<string | null>(null);
  readonly newPersonName = signal('');
  readonly submitting = signal(false);
  readonly people = this.peopleService.people;

  readonly personOptions = computed<SelectOption<string>[]>(() => {
    const existingHeld = new Set(this.moneyHeldService.heldPeople().map((person) => person.person_id));
    const options = this.people()
      .filter((person) => !existingHeld.has(person.id))
      .map((person) => ({ label: person.name, value: person.id, icon: 'user' }));
    options.push({ label: 'Other — add new person', value: NEW_PERSON, icon: 'plus' });
    return options;
  });

  readonly canSave = computed(() =>
    this.personId() === NEW_PERSON
      ? this.newPersonName().trim().length > 0
      : !!this.personId(),
  );

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      let personId = this.personId();
      if (personId === NEW_PERSON) {
        const person = await this.peopleService.create(this.newPersonName());
        personId = person.id;
      }
      const heldPerson = await this.moneyHeldService.addPerson(personId!);
      this.snack.open('Person added to Money Held.', undefined, { duration: 2000 });
      this.ref.close({ saved: true, heldPerson });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t add — please try again.'), 'Dismiss', { duration: 4000 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}
