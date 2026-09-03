import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Uniform text input that matches the login field exactly.
 * - Label sits ABOVE the field (never floats inside).
 * - Placeholder shown inside.
 * - Optional Lucide icon on the left.
 * - Optional prefix/suffix content projected in.
 * - Soft-gray fill → white with indigo border on focus; red on invalid.
 *
 * Use for text/number/email/password/tel inputs. For selects and datepickers,
 * keep <mat-form-field appearance="fill"> (styled to match visually).
 */
@Component({
  selector: 'app-text-field',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    @if (label()) {
      <label class="ft-label">{{ label() }}</label>
    }
    <div
      class="ft-field"
      [class.invalid]="invalid()"
      [class.focused]="focused()"
    >
      @if (leadIcon()) {
        <lucide-icon class="ft-lead" [name]="leadIcon()!" />
      }
      <ng-content select="[prefix]" />
      <input
        #inputEl
        [type]="type()"
        [placeholder]="placeholder()"
        [attr.inputmode]="inputmode() || null"
        [attr.min]="min()"
        [attr.max]="max()"
        [attr.step]="step()"
        [attr.maxlength]="maxlength()"
        [attr.autocomplete]="autocomplete() || null"
        [attr.name]="name() || null"
        [attr.autofocus]="autofocus() ? '' : null"
        [ngModel]="value()"
        (ngModelChange)="onChange($event)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false); blur.emit()"
        (keydown.enter)="enter.emit()"
      />
      <ng-content select="[suffix]" />
    </div>
    @if (hint()) {
      <div class="ft-hint">{{ hint() }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }

      .ft-field {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--app-input-bg);
        border: 1px solid transparent;
        border-radius: 14px;
        padding: 0 12px;
        height: 52px;
        transition: border-color .15s ease, background .15s ease;
      }

      .ft-field.focused {
        background: #fff;
        border-color: var(--app-accent);
      }

      .ft-field.invalid {
        border-color: var(--app-negative);
      }

      .ft-lead {
        width: 20px;
        height: 20px;
        color: var(--app-ink-muted);
        flex: 0 0 auto;
      }

      .ft-field ::ng-deep [prefix],
      .ft-field ::ng-deep [suffix] {
        color: var(--app-ink-muted);
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
      }

      input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        font: inherit;
        font-size: 16px;
        color: var(--app-ink);
        appearance: none;
      }

      input::placeholder {
        color: var(--app-ink-subtle);
      }

      // Kill the ugly spinner on number inputs
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      input[type="number"] {
        -moz-appearance: textfield;
      }

      .ft-hint {
        margin-top: 6px;
        font-size: 12px;
        color: var(--app-ink-muted);
      }
    `,
  ],
})
export class TextFieldComponent {
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly type = input<'text' | 'number' | 'email' | 'password' | 'tel'>('text');
  readonly leadIcon = input<string | null>(null);
  readonly inputmode = input<string>('');
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input<number | string | null>(null);
  readonly maxlength = input<number | null>(null);
  readonly autocomplete = input<string>('');
  readonly name = input<string>('');
  readonly autofocus = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly hint = input<string>('');

  readonly value = input<string | number | null>(null);
  readonly valueChange = output<string | number | null>();
  readonly enter = output<void>();
  readonly blur = output<void>();

  readonly focused = signal(false);

  @ViewChild('inputEl') private readonly inputEl?: ElementRef<HTMLInputElement>;

  focus(): void {
    this.inputEl?.nativeElement.focus();
  }

  onChange(raw: string | number | null): void {
    if (this.type() === 'number') {
      if (raw === '' || raw == null) {
        this.valueChange.emit(null);
      } else {
        const n = Number(raw);
        this.valueChange.emit(Number.isNaN(n) ? null : n);
      }
    } else {
      this.valueChange.emit(raw);
    }
  }
}
