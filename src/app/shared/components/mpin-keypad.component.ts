import { Component, DestroyRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { shuffleDigits } from '../utils/random-utils';

export type MpinLength = 4 | 6;

type KeypadCell =
  | { slot: number; kind: 'digit'; digit: number }
  | { slot: number; kind: 'blank' }
  | { slot: number; kind: 'backspace' };

/**
 * Numeric keypad with a dot display for PIN entry.
 *
 * The 10 digits are re-shuffled (crypto.getRandomValues, each digit exactly
 * once) every time the component is created — parents re-create it per lock
 * screen appearance / setup stage via `@if`. The PIN itself never leaves this
 * component except through `completed` (and is never logged).
 *
 * Layout (12 cells, 3 × 4): three shuffled digit rows on top, then
 * [ blank ][ shuffled digit ][ backspace ].
 */
@Component({
  selector: 'app-mpin-keypad',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      class="mpin-dots"
      role="status"
      [attr.aria-label]="entry().length + ' of ' + length() + ' digits entered'"
    >
      @for (dot of dots(); track $index) {
        <span class="dot" [class.filled]="dot"></span>
      }
    </div>

    <div class="keypad-grid" [class.shake]="shake()">
      @for (cell of cells(); track cell.slot) {
        @switch (cell.kind) {
          @case ('digit') {
            <button
              type="button"
              class="key digit-key"
              [disabled]="disabled()"
              (click)="press(cell.digit)"
            >
              {{ cell.digit }}
            </button>
          }
          @case ('backspace') {
            <button
              type="button"
              class="key util-key"
              [disabled]="disabled() || entry().length === 0"
              (click)="backspace()"
              aria-label="Backspace"
            >
              <lucide-icon name="delete" />
            </button>
          }
          @default {
            <span class="key key-blank" aria-hidden="true"></span>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .mpin-dots {
        display: flex;
        justify-content: center;
        gap: 12px;
        min-height: 18px;
        margin-bottom: 18px;
      }
      .dot {
        width: 13px;
        height: 13px;
        border: 2px solid var(--app-ink-muted);
        border-radius: 50%;
        background: transparent;
        transition: background .12s ease, border-color .12s ease, transform .12s ease;
      }
      .dot.filled {
        border-color: var(--app-accent);
        background: var(--app-accent);
        transform: scale(1.05);
      }

      .keypad-grid {
        display: grid;
        grid-template-columns: repeat(3, 64px);
        grid-auto-rows: 56px;
        gap: 10px;
        justify-content: center;
      }
      .key {
        display: grid;
        place-items: center;
        border: 1px solid var(--app-hairline);
        border-radius: 16px;
        background: var(--app-input-bg);
        color: var(--app-ink);
        cursor: pointer;
        font: inherit;
        font-size: 21px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        transition: transform .06s ease, background .12s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .key:active:not(:disabled) {
        transform: scale(.94);
        background: var(--app-accent-soft);
      }
      .key:disabled { opacity: .45; cursor: default; }
      .key-blank { border: 0; background: transparent; }
      .util-key lucide-icon { width: 21px; height: 21px; }
      .util-key { color: var(--app-ink-muted); }

      .shake { animation: keypad-shake .3s ease; }
      @keyframes keypad-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-7px); }
        50% { transform: translateX(6px); }
        75% { transform: translateX(-4px); }
      }

      @media (max-width: 380px) {
        .keypad-grid { grid-template-columns: repeat(3, 58px); grid-auto-rows: 52px; }
      }
    `,
  ],
})
export class MpinKeypadComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly length = input<MpinLength>(4);
  readonly disabled = input(false);
  /** Fires once when the entry reaches `length` digits. */
  readonly completed = output<string>();

  readonly entry = signal('');
  /** One cell per grid slot; the digit order is randomized per appearance. */
  readonly cells = signal<KeypadCell[]>(buildCells());
  /** Set briefly after a failed attempt so the dots shake. */
  readonly shake = signal(false);

  readonly dots = computed(() =>
    Array.from({ length: this.length() }, (_, i) => i < this.entry().length),
  );

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      this.press(Number(event.key));
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.backspace();
    }
  }

  press(digit: number): void {
    if (this.disabled() || this.entry().length >= this.length()) return;
    const next = `${this.entry()}${digit}`;
    this.entry.set(next);
    if (next.length === this.length()) {
      this.completed.emit(next);
    }
  }

  backspace(): void {
    if (this.disabled() || this.entry().length === 0) return;
    this.entry.set(this.entry().slice(0, -1));
  }

  /** Clear the entry and re-shuffle the digits (used after a failed attempt). */
  reset(): void {
    this.entry.set('');
    this.cells.set(buildCells());
  }

  /** Brief shake, then clear — the "wrong PIN" feedback. */
  reject(): void {
    this.shake.set(true);
    const timer = setTimeout(() => {
      this.shake.set(false);
      this.reset();
    }, 320);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}

/**
 * 12 grid cells: digits occupy slots 0–8 and 10 (bottom middle), slot 9 is
 * blank, slot 11 is backspace — so the bottom row reads [blank][d][⌫].
 */
function buildCells(): KeypadCell[] {
  const digits = shuffleDigits();
  const cells: KeypadCell[] = [];
  let next = 0;
  for (let slot = 0; slot < 12; slot++) {
    if (slot === 9) {
      cells.push({ slot, kind: 'blank' });
    } else if (slot === 11) {
      cells.push({ slot, kind: 'backspace' });
    } else {
      cells.push({ slot, kind: 'digit', digit: digits[next++] });
    }
  }
  return cells;
}
