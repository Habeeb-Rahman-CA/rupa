import {
  Component,
  computed,
  ElementRef,
  ViewChild,
  input,
  output,
  signal,
} from '@angular/core';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  icon?: string;
}

/**
 * Uniform select control that matches the login text field:
 * - External label above
 * - Soft gray filled trigger, 14px radius, 52px tall
 * - Chevron on the right; opens a themed Material menu
 * - Focus (open) → white bg + indigo border
 */
@Component({
  selector: 'app-select-field',
  standalone: true,
  imports: [MatMenuModule, LucideAngularModule],
  template: `
    @if (label()) {
      <label class="ft-label">{{ label() }}</label>
    }

    <button
      #trigger
      type="button"
      class="sf-trigger"
      [class.focused]="isOpen()"
      [class.invalid]="invalid()"
      [matMenuTriggerFor]="menu"
      (menuOpened)="isOpen.set(true)"
      (menuClosed)="isOpen.set(false)"
    >
      @if (selected()?.icon) {
        <lucide-icon class="sf-lead" [name]="selected()!.icon!" />
      }
      <span class="sf-value" [class.placeholder]="!selected()">
        {{ selected()?.label ?? placeholder() }}
      </span>
      <lucide-icon class="sf-chev" name="chevron-down" />
    </button>

    <mat-menu #menu="matMenu" [xPosition]="'before'">
      <div class="sf-menu-inner" [style.min-width.px]="menuMinWidth()">
        @for (opt of options(); track opt.value) {
          <button
            mat-menu-item
            type="button"
            (click)="pick(opt)"
            [class.selected]="isSelected(opt)"
          >
            @if (opt.icon) {
              <lucide-icon [name]="opt.icon" />
            }
            <span>{{ opt.label }}</span>
          </button>
        }
      </div>
    </mat-menu>
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

      .sf-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 52px;
        padding: 0 14px 0 12px;
        background: var(--app-input-bg);
        border: 1px solid transparent;
        border-radius: 14px;
        cursor: pointer;
        transition: background .15s ease, border-color .15s ease;
        font: inherit;
        color: var(--app-ink);
        text-align: left;
      }
      .sf-trigger.focused {
        background: #fff;
        border-color: var(--app-accent);
      }
      .sf-trigger.invalid {
        border-color: var(--app-negative);
      }

      .sf-lead {
        width: 20px;
        height: 20px;
        color: var(--app-ink-muted);
        flex: 0 0 auto;
      }

      .sf-value {
        flex: 1;
        min-width: 0;
        font-size: 15px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sf-value.placeholder {
        color: var(--app-ink-subtle);
      }

      .sf-chev {
        width: 18px;
        height: 18px;
        color: var(--app-ink-muted);
        flex: 0 0 auto;
      }
    `,
    // Menu items — styled globally by our overrides; selected state accent
    `
      ::ng-deep .sf-menu-inner .selected {
        background: var(--app-accent-soft) !important;
        color: var(--app-accent) !important;
      }
    `,
  ],
})
export class SelectFieldComponent<T = string> {
  readonly label = input<string>('');
  readonly placeholder = input<string>('Select');
  readonly options = input<SelectOption<T>[]>([]);
  readonly value = input<T | null>(null);
  readonly invalid = input<boolean>(false);
  readonly valueChange = output<T | null>();

  readonly isOpen = signal(false);

  @ViewChild('trigger', { read: ElementRef })
  private readonly triggerEl?: ElementRef<HTMLButtonElement>;

  readonly menuMinWidth = computed(
    () => this.triggerEl?.nativeElement.getBoundingClientRect().width ?? 200,
  );

  readonly selected = computed<SelectOption<T> | null>(() => {
    const v = this.value();
    if (v == null) return null;
    return this.options().find((o) => o.value === v) ?? null;
  });

  isSelected(opt: SelectOption<T>): boolean {
    return opt.value === this.value();
  }

  pick(opt: SelectOption<T>): void {
    this.valueChange.emit(opt.value);
  }
}
