import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { MpinKeypadComponent, MpinLength } from '../../shared/components/mpin-keypad.component';
import { MpinService } from '../../core/services/mpin.service';
import { errorText } from '../../shared/utils/error-utils';

export type MpinDialogMode = 'setup' | 'change' | 'disable' | 'reset';

export interface MpinDialogData {
  mode: MpinDialogMode;
}

type Stage = 'length' | 'verify' | 'enter' | 'confirm';

/**
 * Setup / change / disable / forgot-reset dialog for the App Lock MPIN.
 *
 * Stage flows:
 *   setup   : length → enter → confirm
 *   change  : verify (current) → enter → confirm
 *   disable : verify (current) → close(true)
 *   reset   : enter → confirm            (no old PIN — launched from the
 *             lock screen, so an active login session authorizes it)
 *
 * The keypad is re-created per stage (fresh digit shuffle) and after every
 * failed attempt. PIN values live only in signals here and in the Web Crypto
 * call — never logged, never stored in plain text.
 */
@Component({
  selector: 'app-mpin-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    MpinKeypadComponent,
  ],
  template: `
    <div class="wrap">
      <div class="icon" [class.destructive]="data.mode === 'disable'">
        <lucide-icon [name]="icon()" />
      </div>

      <h2 mat-dialog-title>{{ title() }}</h2>
      @if (subtitle(); as subtitle) {
        <p class="subtitle">{{ subtitle }}</p>
      }

      @if (error(); as error) {
        <p class="error" role="alert">{{ error }}</p>
      }

      @if (stage() === 'length') {
        <div class="length-picker">
          <mat-button-toggle-group
            [value]="pinLength()"
            (change)="pinLength.set($event.value)"
            aria-label="MPIN length"
          >
            <mat-button-toggle [value]="4">4 digits</mat-button-toggle>
            <mat-button-toggle [value]="6">6 digits</mat-button-toggle>
          </mat-button-toggle-group>
          <p class="hint">
            You'll be asked to enter it twice to confirm. It locks the app on
            launch and when you return after the auto-lock timeout.
          </p>
          <div class="actions">
            <button mat-button type="button" (click)="ref.close(false)">
              Cancel
            </button>
            <button mat-flat-button color="primary" type="button" (click)="startEntry()">
              Continue
            </button>
          </div>
        </div>
      } @else {
        <!-- One view per tick: re-created (new shuffle) whenever the stage
             or a failed attempt bumps the counter. -->
        @for (tick of [keypadTick()]; track tick) {
          <app-mpin-keypad
            [length]="entryLength()"
            [disabled]="busy()"
            (completed)="onCompleted($event)"
          />
        }

        <div class="actions">
          <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">
            Cancel
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .wrap {
        min-width: 300px;
        max-width: 340px;
        padding: 20px 16px 12px;
        text-align: center;
      }
      .icon {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        margin: 0 auto;
      }
      .icon.destructive {
        background: var(--app-negative-soft);
        color: var(--app-negative);
      }
      .icon lucide-icon {
        width: 22px;
        height: 22px;
      }
      h2 {
        text-align: center;
        margin: 12px 0 0 !important;
        font-size: 17px !important;
        padding: 0;
      }
      .subtitle {
        margin: 6px 0 14px;
        color: var(--app-ink-muted);
        font-size: 13px;
        line-height: 1.45;
      }
      .error {
        margin: 0 0 10px;
        color: var(--app-negative, #dc2626);
        font-size: 13px;
        font-weight: 600;
      }
      .hint {
        margin: 12px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .length-picker {
        margin-top: 8px;
      }
      .length-picker .hint {
        margin-top: 14px;
      }
      .actions {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 14px;
      }
    `,
  ],
})
export class MpinDialogComponent {
  readonly ref = inject<MatDialogRef<MpinDialogComponent, boolean>>(
    MatDialogRef,
  );
  readonly data = inject<MpinDialogData>(MAT_DIALOG_DATA);

  private readonly mpin = inject(MpinService);
  private readonly snackBar = inject(MatSnackBar);

  readonly stage = signal<Stage>(
    this.data.mode === 'setup'
      ? 'length'
      : this.data.mode === 'disable' || this.data.mode === 'change'
        ? 'verify'
        : 'enter',
  );
  readonly pinLength = signal<MpinLength>(this.mpin.pinLength());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Re-created (re-shuffled) whenever bumped — stage changes & failed tries. */
  readonly keypadTick = signal(0);
  /** The MPIN length currently being entered (chosen at the length stage). */
  readonly entryLength = signal<MpinLength>(this.mpin.pinLength());

  @ViewChild(MpinKeypadComponent) private keypad?: MpinKeypadComponent;
  private firstPin: string | null = null;

  readonly icon = computed(() => {
    switch (this.data.mode) {
      case 'setup':
        return 'lock';
      case 'change':
        return 'key-round';
      case 'disable':
        return 'lock-open';
      case 'reset':
        return 'shield';
    }
  });

  readonly title = computed(() => {
    const mode = this.data.mode;
    const stage = this.stage();
    if (mode === 'setup') {
      return stage === 'length' ? 'Set up App Lock' : stage === 'enter' ? 'Enter a new MPIN' : 'Confirm your MPIN';
    }
    if (mode === 'change') {
      return stage === 'verify' ? 'Enter your current MPIN' : stage === 'enter' ? 'Enter a new MPIN' : 'Confirm your new MPIN';
    }
    if (mode === 'disable') return 'Enter your current MPIN';
    return stage === 'enter' ? 'Choose a new MPIN' : 'Confirm your MPIN';
  });

  readonly subtitle = computed<string | null>(() => {
    const mode = this.data.mode;
    const stage = this.stage();
    if (mode === 'disable') return 'Turning off App Lock requires your current MPIN.';
    if (mode === 'reset') {
      return stage === 'enter'
        ? 'You’re signed in, so you can set a new MPIN without the old one.'
        : 'Enter the same MPIN again to confirm.';
    }
    if (stage === 'enter') return `Choose a ${this.entryLength()}-digit MPIN.`;
    if (stage === 'confirm') return 'Enter the same MPIN again to confirm.';
    if (stage === 'verify') return 'This keeps your settings protected.';
    return null;
  });

  // ------------------------------------------------------------- stages

  /** Length chosen → remember it and open a fresh keypad for entry. */
  startEntry(): void {
    this.entryLength.set(this.pinLength());
    this.error.set(null);
    this.stage.set('enter');
    this.bumpKeypad();
  }

  async onCompleted(pin: string): Promise<void> {
    if (this.busy()) return;
    const stage = this.stage();
    this.error.set(null);

    if (stage === 'verify') {
      this.busy.set(true);
      try {
        const result = await this.mpin.verify(pin);
        if (result.ok) {
          if (this.data.mode === 'disable') {
            this.mpin.disable();
            this.snackBar.open('App Lock turned off.', undefined, { duration: 2500 });
            this.ref.close(true);
            return;
          }
          this.stage.set('enter');
          this.entryLength.set(this.mpin.pinLength());
          this.bumpKeypad();
        } else if (result.lockUntil !== null && result.lockUntil > Date.now()) {
          const seconds = Math.ceil((result.lockUntil - Date.now()) / 1000);
          this.error.set(`Too many attempts — try again in ${seconds}s.`);
          this.rejectKeypad();
        } else {
          this.error.set(
            `Incorrect MPIN — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`,
          );
          this.rejectKeypad();
        }
      } finally {
        this.busy.set(false);
      }
      return;
    }

    if (stage === 'enter') {
      this.firstPin = pin;
      this.stage.set('confirm');
      this.bumpKeypad();
      return;
    }

    // stage === 'confirm'
    if (pin !== this.firstPin) {
      this.firstPin = null;
      this.error.set('MPINs didn’t match — start again.');
      this.stage.set('enter');
      this.bumpKeypad();
      return;
    }

    this.busy.set(true);
    try {
      await this.mpin.setPin(pin);
      this.snackBar.open(
        this.data.mode === 'change' ? 'MPIN changed.' : 'App Lock enabled.',
        undefined,
        { duration: 2500 },
      );
      this.ref.close(true);
    } catch (err: unknown) {
      this.error.set(errorText(err, 'Couldn’t save the MPIN.'));
      this.stage.set('enter');
      this.firstPin = null;
      this.bumpKeypad();
    } finally {
      this.busy.set(false);
    }
  }

  /** Shake + re-shuffle after a wrong PIN (keypad handles its own reset). */
  private rejectKeypad(): void {
    this.keypad?.reject();
  }

  private bumpKeypad(): void {
    this.keypadTick.update((n) => n + 1);
  }
}
