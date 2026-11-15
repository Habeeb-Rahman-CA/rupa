import { Component, DestroyRef, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

import { MpinService } from '../../core/services/mpin.service';
import { MpinKeypadComponent } from '../../shared/components/mpin-keypad.component';
import { MpinDialogComponent } from '../settings/mpin-dialog.component';
import { openConfirm } from '../../shared/components/confirm-dialog.component';

/**
 * The MPIN lock screen (route `/lock` — outside the shell, so no feature
 * service loads while the app is locked).
 *
 * Shown on fresh launch and whenever the app locks after the auto-lock
 * timeout. Digits are shuffled per appearance (the keypad is re-created via
 * the tick counter). "Forgot MPIN" reset runs as a dialog in `reset` mode —
 * reachable only here, which itself sits behind `authGuard`, so an existing
 * login session is what authorizes the reset.
 */
@Component({
  selector: 'app-lock-page',
  standalone: true,
  imports: [
    MatButtonModule,
    LucideAngularModule,
    MpinKeypadComponent,
  ],
  template: `
    <div class="lock-screen">
      <div class="brand">
        <div class="logo">
          <lucide-icon name="lock" />
        </div>
        <h1>rūpa is locked</h1>
        <p class="subtitle">Enter your MPIN to continue</p>
      </div>

      @if (error(); as error) {
        <p class="error" role="alert">{{ error }}</p>
      }

      @for (tick of [keypadTick()]; track tick) {
        <app-mpin-keypad
          [length]="mpin.pinLength()"
          [disabled]="busy() || lockoutActive()"
          (completed)="verify($event)"
        />
      }

      @if (lockoutActive()) {
        <p class="lockout" role="status">
          Too many attempts — try again in {{ lockoutSeconds() }}s.
        </p>
      }

      <button
        mat-button
        type="button"
        class="forgot-btn"
        [disabled]="busy() || lockoutActive()"
        (click)="forgot()"
      >
        Forgot MPIN?
      </button>
    </div>
  `,
  styles: [
    `
      .lock-screen {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        background: var(--app-bg, #fff);
      }
      .brand {
        text-align: center;
        margin-bottom: 22px;
      }
      .logo {
        width: 56px;
        height: 56px;
        margin: 0 auto 14px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .logo lucide-icon {
        width: 26px;
        height: 26px;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--app-ink);
      }
      .subtitle {
        margin: 6px 0 0;
        color: var(--app-ink-muted);
        font-size: 13px;
      }
      .error {
        margin: 0 0 12px;
        color: var(--app-negative, #dc2626);
        font-size: 13.5px;
        font-weight: 600;
      }
      .lockout {
        margin: 14px 0 0;
        color: var(--app-negative, #dc2626);
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .forgot-btn {
        margin-top: 26px;
        color: var(--app-ink-muted);
        font-size: 13px;
      }
    `,
  ],
})
export class LockPage {
  readonly mpin = inject(MpinService);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Re-shuffles the digits — bumped after every failed attempt. */
  readonly keypadTick = signal(0);
  /** Epoch ms of the active lockout, or null. */
  readonly lockoutUntil = signal<number | null>(null);
  readonly lockoutSeconds = signal(0);
  readonly lockoutActive = signal(false);

  @ViewChild(MpinKeypadComponent) private keypad?: MpinKeypadComponent;

  private countdown: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Not configured (e.g. deep link after turning MPIN off) → nothing to unlock.
    if (!this.mpin.isConfigured()) {
      void this.router.navigateByUrl(this.returnUrl(), { replaceUrl: true });
      return;
    }
    // A lockout persisted by a refresh continues counting down here.
    const existing = this.mpin.lockUntil();
    if (existing !== null && existing > Date.now()) {
      this.startCountdown(existing);
    }
  }

  verify(pin: string): void {
    if (this.busy() || this.lockoutActive()) return;
    this.busy.set(true);
    this.error.set(null);
    void this.mpin
      .verify(pin)
      .then((result) => {
        if (result.ok) {
          const returnUrl = this.returnUrl();
          void this.router.navigateByUrl(returnUrl, { replaceUrl: true });
          return;
        }
        if (result.lockUntil !== null && result.lockUntil > Date.now()) {
          this.startCountdown(result.lockUntil);
        }
        this.error.set(
          result.lockUntil !== null
            ? null // countdown line shows the lockout instead
            : `Incorrect MPIN — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`,
        );
        // Shake + clear + re-shuffle (reject does all three).
        this.keypad?.reject();
      })
      .finally(() => this.busy.set(false));
  }

  /** Reset flow: confirm identity with the active login, then set a new MPIN. */
  async forgot(): Promise<void> {
    if (this.lockoutActive()) return;
    const confirmed = await openConfirm(this.dialog, {
      title: 'Reset your MPIN?',
      message:
        'You’re signed in, so a new MPIN can be set without the old one. Your current MPIN will stop working.',
      confirmLabel: 'Continue',
      icon: 'shield',
    });
    if (!confirmed) return;

    const ref = this.dialog.open(MpinDialogComponent, {
      data: { mode: 'reset' },
      disableClose: true,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.error.set(null);
        const returnUrl = this.returnUrl();
        void this.router.navigateByUrl(returnUrl, { replaceUrl: true });
      }
    });
  }

  private returnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
    // Only in-app paths — never allow an open redirect off-origin.
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  }

  private startCountdown(until: number): void {
    this.lockoutUntil.set(until);
    this.lockoutActive.set(true);
    this.tickCountdown();
    if (this.countdown === null) {
      this.countdown = setInterval(() => this.tickCountdown(), 500);
      this.destroyRef.onDestroy(() => this.stopCountdown());
    }
  }

  private tickCountdown(): void {
    const until = this.lockoutUntil();
    if (until === null) return;
    const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    this.lockoutSeconds.set(remaining);
    if (remaining === 0) {
      this.stopCountdown();
      this.lockoutActive.set(false);
      this.lockoutUntil.set(null);
      this.error.set(null);
      this.keypad?.reset(); // re-enable with a fresh shuffle
    }
  }

  private stopCountdown(): void {
    if (this.countdown !== null) {
      clearInterval(this.countdown);
      this.countdown = null;
    }
  }
}
