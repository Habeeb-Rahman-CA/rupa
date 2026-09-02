import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { openContactDialog } from '../legal/contact-dialog.component';

type Mode = 'login' | 'signup';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatProgressSpinnerModule,
    LucideAngularModule,
    TextFieldComponent,
  ],
  template: `
    <div class="page">
      <!-- Hero -->
      <section class="hero">
        <div class="hero-inner">
          <img
            class="brand-logo"
            src="rupa-logo-light.png"
            alt="rūpa"
            width="88"
            height="34"
          />
          <h1>{{ heroTitle() }}</h1>
          <p>{{ heroSubtitle() }}</p>
        </div>
      </section>

      <!-- Card -->
      <section class="card">
        <!-- Mode toggle -->
        <div class="mode-toggle">
          <button
            type="button"
            [class.active]="mode() === 'login'"
            (click)="setMode('login')"
          >
            Log in
          </button>
          <button
            type="button"
            [class.active]="mode() === 'signup'"
            (click)="setMode('signup')"
          >
            Sign up
          </button>
        </div>

        <form (ngSubmit)="submit()">
          @if (mode() === 'signup') {
            <app-text-field
              label="Name"
              placeholder="What should we call you?"
              autocomplete="name"
              [maxlength]="60"
              [value]="name()"
              (valueChange)="name.set($any($event) ?? '')"
              leadIcon="circle-user"
            />
          }

          <app-text-field
            label="Email"
            placeholder="you@example.com"
            type="email"
            autocomplete="email"
            [value]="email()"
            (valueChange)="email.set($any($event) ?? '')"
            leadIcon="mail"
            [invalid]="showEmailError()"
          />

          <app-text-field
            label="Password"
            [placeholder]="mode() === 'signup' ? 'At least 6 characters' : 'Enter your password'"
            [type]="showPassword() ? 'text' : 'password'"
            [autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
            [value]="password()"
            (valueChange)="password.set($any($event) ?? '')"
            (enter)="submit()"
            leadIcon="lock"
            [invalid]="showPasswordError()"
          >
            <button
              suffix
              type="button"
              class="eye"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <lucide-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
            </button>
          </app-text-field>

          <div class="forgot-row">
            <button
              type="button"
              class="forgot-link"
              (click)="forgotPassword()"
              [disabled]="sendingReset()"
            >
              {{ sendingReset() ? 'Sending…' : 'Forgot password?' }}
            </button>
          </div>

          @if (errorMessage()) {
            <div class="error" role="alert">{{ errorMessage() }}</div>
          }
          @if (infoMessage()) {
            <div class="info" role="status">{{ infoMessage() }}</div>
          }

          <button
            type="submit"
            class="submit"
            [disabled]="!canSubmit() || submitting()"
          >
            @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              {{ mode() === 'login' ? 'Log in' : 'Sign up' }}
            }
          </button>

          <p class="terms-notice">
            By {{ mode() === 'login' ? 'logging in' : 'signing up' }}, you agree to our
            <a routerLink="/terms" class="terms-link">Terms of Service</a>.
          </p>

          <div class="contact-row">
            <button
              type="button"
              class="contact-btn"
              (click)="openContact()"
            >
              <lucide-icon name="mail" />
              <span>Contact us</span>
            </button>
          </div>

          <p class="built-by">built by <strong>bilet</strong></p>
        </form>
      </section>
    </div>
  `,
  styles: [
    `
      :host { display: block; height: 100%; }

      .page {
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background: var(--app-canvas);
      }

      /* ---------- Hero -------------------------------------------- */
      .hero {
        background:
          radial-gradient(120% 100% at 0% 0%, #2a2d35 0%, #14161b 55%, #0b0d10 100%);
        color: #fff;
        padding: calc(56px + env(safe-area-inset-top)) 24px 96px;
        position: relative;
      }
      .hero-inner {
        max-width: 480px;
        margin: 0 auto;
      }
      .brand-logo {
        display: block;
        height: 48px;
        width: auto;
        margin-bottom: 20px;
        opacity: 0.95;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 32px;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.1;
      }
      .hero p {
        margin: 0;
        font-size: 14px;
        opacity: 0.85;
        max-width: 420px;
        line-height: 1.5;
      }

      /* ---------- Card overlapping ---------------------------------- */
      .card {
        flex: 1;
        background: var(--app-surface);
        margin-top: -56px;
        border-top-left-radius: 28px;
        border-top-right-radius: 28px;
        padding: 24px 24px 32px;
        box-shadow: 0 -8px 24px rgba(15, 17, 20, 0.04);
        max-width: 480px;
        width: 100%;
        margin-left: auto;
        margin-right: auto;
        z-index: 1;
      }

      /* ---------- Mode toggle --------------------------------------- */
      .mode-toggle {
        display: flex;
        gap: 4px;
        background: var(--app-input-bg);
        border-radius: 999px;
        padding: 4px;
        margin-bottom: 20px;
      }
      .mode-toggle button {
        flex: 1;
        padding: 10px 16px;
        border: 0;
        background: transparent;
        color: var(--app-ink-muted);
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        border-radius: 999px;
        cursor: pointer;
        transition: background .15s ease, color .15s ease;
      }
      .mode-toggle button.active {
        background: #fff;
        color: var(--app-ink);
        box-shadow: var(--app-shadow-sm);
      }

      /* ---------- Form ---------------------------------------------- */
      form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .eye {
        border: 0;
        background: transparent;
        color: var(--app-ink-muted);
        cursor: pointer;
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 999px;

        lucide-icon { width: 20px; height: 20px; }
        &:hover { color: var(--app-ink); }
      }

      /* ---------- Forgot + hint + error + submit -------------------- */
      .forgot-row {
        display: flex;
        justify-content: flex-end;
        margin-top: -4px;
      }
      .forgot-link {
        border: 0;
        background: transparent;
        color: var(--app-ink-muted);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 8px;

        &:hover { color: var(--app-ink); }
        &:disabled { cursor: default; opacity: 0.6; }
      }
      .signup-hint {
        margin: -4px 0 0;
        font-size: 12px;
        color: var(--app-ink-muted);
        line-height: 1.5;
      }
      .error {
        color: var(--app-negative);
        background: var(--app-negative-soft);
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
      }
      .info {
        color: var(--app-positive);
        background: var(--app-positive-soft);
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
      }
      .submit {
        height: 54px;
        border: 0;
        border-radius: 999px;
        background: var(--app-ink-dark);
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.01em;
        cursor: pointer;
        margin-top: 4px;
        display: grid;
        place-items: center;
        transition: transform .1s ease, opacity .15s ease;

        &:hover:not(:disabled) { opacity: 0.94; }
        &:active:not(:disabled) { transform: scale(0.99); }
        &:disabled { opacity: 0.55; cursor: default; }
      }

      .terms-notice {
        margin: 16px 4px 0;
        font-size: 12px;
        color: var(--app-ink-muted);
        text-align: center;
        line-height: 1.5;
      }
      .terms-link {
        color: var(--app-ink);
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .terms-link:hover { color: var(--app-accent); }

      .contact-row {
        display: flex;
        justify-content: center;
        margin-top: 10px;
      }
      .contact-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px solid var(--app-hairline);
        border-radius: 999px;
        background: transparent;
        color: var(--app-ink-muted);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background .12s ease, color .12s ease, border-color .12s ease;

        lucide-icon { width: 14px; height: 14px; }

        &:hover {
          color: var(--app-ink);
          background: var(--app-input-bg);
          border-color: rgba(15, 17, 20, 0.14);
        }
      }

      .built-by {
        margin: 16px 0 0;
        text-align: center;
        font-size: 11px;
        color: var(--app-ink-subtle);
        letter-spacing: 0.04em;

        strong {
          color: var(--app-ink);
          font-weight: 700;
        }
      }
    `,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly mode = signal<Mode>('login');
  readonly submitting = signal(false);
  readonly sendingReset = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly touched = signal(false);

  readonly heroTitle = computed(() =>
    this.mode() === 'login' ? 'Welcome back' : 'Create your account',
  );
  readonly heroSubtitle = computed(() =>
    this.mode() === 'login'
      ? 'Your money, made simple. Sign in to pick up right where you left off.'
      : 'A minute to set up, a lifetime of clean books. Let’s get you started.',
  );

  readonly canSubmit = computed(() => {
    const em = this.email().trim();
    const pw = this.password();
    if (!isEmail(em)) return false;
    if (pw.length < 6) return false;
    return true;
  });

  setMode(next: Mode): void {
    if (this.mode() === next) return;
    this.mode.set(next);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    this.touched.set(false);
  }

  showEmailError(): boolean {
    return this.touched() && !isEmail(this.email().trim());
  }
  showPasswordError(): boolean {
    return this.touched() && this.password().length < 6;
  }

  async submit(): Promise<void> {
    this.touched.set(true);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    if (!this.canSubmit()) return;
    this.submitting.set(true);

    const em = this.email().trim();
    const pw = this.password();
    const nm = this.name().trim();

    if (this.mode() === 'signup') {
      const { data, error } = await this.auth.signUp(em, pw, nm || undefined);
      this.submitting.set(false);
      if (error) {
        this.errorMessage.set(error.message);
        return;
      }
      if (data.session) {
        this.router.navigateByUrl('/dashboard');
      } else {
        this.infoMessage.set(
          'Almost there — check your email for a confirmation link, then log in.',
        );
        this.setMode('login');
      }
      return;
    }

    const { error } = await this.auth.signInWithPassword(em, pw);
    this.submitting.set(false);
    if (error) {
      this.errorMessage.set(error.message);
      return;
    }
    this.router.navigateByUrl('/dashboard');
  }

  openContact(): void {
    openContactDialog(this.dialog);
  }

  async forgotPassword(): Promise<void> {
    const em = this.email().trim();
    if (!isEmail(em)) {
      this.touched.set(true);
      this.snack.open('Type your email above first, then tap "Forgot password".', undefined, { duration: 3500 });
      return;
    }
    this.sendingReset.set(true);
    const { error } = await this.auth.sendPasswordReset(em);
    this.sendingReset.set(false);
    if (error) {
      this.snack.open(error.message, 'Dismiss', { duration: 4000 });
    } else {
      this.snack.open('A reset link is on its way — check your inbox.', undefined, { duration: 3500 });
    }
  }
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
