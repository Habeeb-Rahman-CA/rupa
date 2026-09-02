import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  MatDatepickerModule,
  MatDatepickerInputEvent,
} from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Uniform date field matching the login text field.
 *
 * A visually-styled trigger sits underneath an invisible
 * <mat-datepicker-toggle> that fills the same box. Clicking the field
 * actually clicks the toggle button, so Material handles picker.open() itself.
 *
 * The associated matDatepicker input lives inside a visually-hidden
 * <mat-form-field> (matInput requires a MatFormField ancestor to register).
 */
@Component({
  selector: 'app-date-field',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatFormFieldModule,
    LucideAngularModule,
  ],
  template: `
    @if (label()) {
      <label class="ft-label">{{ label() }}</label>
    }

    <div class="df-wrap">
      <div
        class="df-trigger"
        [class.focused]="isOpen()"
        [class.invalid]="invalid()"
      >
        <lucide-icon class="df-lead" name="calendar" />
        <span class="df-value" [class.placeholder]="!value()">
          {{ value() ? (value() | date: displayFormat()) : placeholder() }}
        </span>
      </div>

      <!-- Invisible toggle overlaying the trigger — receives the click -->
      <mat-datepicker-toggle
        class="df-toggle-overlay"
        [for]="picker"
        [disableRipple]="true"
        tabindex="-1"
        aria-label="Open date picker"
      />
    </div>

    <mat-form-field class="hidden-host">
      <input
        matInput
        [matDatepicker]="picker"
        [ngModel]="value()"
        (dateChange)="onDateChange($event)"
        readonly
      />
      <mat-datepicker
        #picker
        (opened)="isOpen.set(true)"
        (closed)="isOpen.set(false)"
      />
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }

      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }

      .df-wrap {
        position: relative;
        width: 100%;
      }

      .df-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 52px;
        padding: 0 14px 0 12px;
        background: var(--app-input-bg);
        border: 1px solid transparent;
        border-radius: 14px;
        transition: background .15s ease, border-color .15s ease;
        pointer-events: none; // clicks go to the overlay toggle
      }
      .df-trigger.focused {
        background: #fff;
        border-color: var(--app-accent);
      }
      .df-trigger.invalid {
        border-color: var(--app-negative);
      }

      .df-lead {
        width: 20px;
        height: 20px;
        color: var(--app-ink-muted);
        flex: 0 0 auto;
      }
      .df-value {
        flex: 1;
        min-width: 0;
        font-size: 15px;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .df-value.placeholder {
        color: var(--app-ink-subtle);
      }

      // The mat-datepicker-toggle stretches over the trigger so any click
      // in the field area opens the picker.
      .df-toggle-overlay {
        position: absolute;
        inset: 0;
        display: block;
        z-index: 1;
      }
      .df-toggle-overlay ::ng-deep .mat-mdc-icon-button {
        width: 100%;
        height: 100%;
        border-radius: 14px;
        opacity: 0;             // invisible but clickable
        --mdc-icon-button-state-layer-size: 100%;
      }

      // Hide the underlying mat-form-field host; datepicker overlay is
      // portalled to the body and remains visible.
      .hidden-host {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
        overflow: hidden;
      }
    `,
  ],
})
export class DateFieldComponent {
  readonly label = input<string>('');
  readonly placeholder = input<string>('Pick a date');
  readonly value = input<Date | null>(null);
  readonly invalid = input<boolean>(false);
  readonly displayFormat = input<string>('MMM d, y');
  readonly valueChange = output<Date | null>();

  readonly isOpen = signal(false);

  onDateChange(e: MatDatepickerInputEvent<Date>): void {
    this.valueChange.emit(e.value ?? null);
  }
}
