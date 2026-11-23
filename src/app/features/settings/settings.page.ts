import { ChangeDetectionStrategy, Component, DestroyRef, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { PushCategory, PushService, PushStatus } from '../../core/services/push.service';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { ProfileDialogComponent } from './profile-dialog.component';
import { MpinService } from '../../core/services/mpin.service';
import { MpinDialogComponent, MpinDialogMode } from './mpin-dialog.component';
import { ResetDataDialogComponent } from './reset-data-dialog.component';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';

const STATUS_META: Record<PushStatus, { label: string; hint: string }> = {
  unsupported: {
    label: 'Not supported',
    hint: 'This browser can’t show push notifications. Try Chrome or Edge, or open rūpa from your iPhone’s Home Screen.',
  },
  dev: {
    label: 'Not available',
    hint: 'Notifications only work in the published app, not while previewing it locally.',
  },
  denied: {
    label: 'Blocked',
    hint: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
  },
  off: {
    label: 'Off',
    hint: 'Turn notifications on to get renewal reminders and low-balance alerts even when the app is closed.',
  },
  active: {
    label: 'On',
    hint: 'This device receives notifications while you are signed in — the app does not need to be open.',
  },
};

@Component({
  selector: 'app-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    LucideAngularModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header title="User Settings" subtitle="Profile, notifications and app lock" />

    <!-- ------------------------------ Profile ------------------- -->
    <section class="app-card settings-card profile-card" aria-label="Profile">
      <div class="profile-head">
        <div class="avatar-wrapper">
          <div class="avatar-circle" [style.background]="avatarColor()">
            {{ initials() }}
          </div>
        </div>
        <div class="profile-info">
          <h2 class="profile-name">{{ displayName() }}</h2>
          <p class="profile-email">{{ userEmail() }}</p>
        </div>
      </div>
      <button
        mat-icon-button
        color="primary"
        type="button"
        class="edit-card-btn"
        (click)="openProfileDialog()"
        aria-label="Edit profile"
      >
        <lucide-icon name="pencil" size="16" />
      </button>
    </section>

    <!-- ------------------------------ Push notifications ------------------- -->
    <section class="app-card settings-card" aria-label="Push notifications">
      <div class="section-heading">
        <div class="heading-text">
          <h2>Push notifications</h2>
        </div>
        <span class="status-chip" [attr.data-status]="push.status()">
          {{ statusMeta().label }}
        </span>
      </div>

      <p class="status-hint">{{ statusMeta().hint }}</p>

      @if (push.message(); as msg) {
        <p class="feedback" [class.error]="push.status() === 'denied'">{{ msg }}</p>
      }

      <div class="primary-actions">
        @if (push.status() === 'off' || push.status() === 'denied') {
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="pill-btn"
            [disabled]="push.busy()"
            (click)="push.enable()"
          >
            @if (push.busy()) {
              <mat-spinner diameter="16" class="btn-spinner" />
            } @else {
              <lucide-icon name="bell" />
            }
            Turn on notifications
          </button>
        }
        @if (push.status() === 'active') {
          <button
            mat-stroked-button
            type="button"
            class="pill-btn"
            [disabled]="push.busy()"
            (click)="push.disable()"
          >
            Turn off on this device
          </button>
          <button
            mat-stroked-button
            type="button"
            class="pill-btn test-btn"
            [disabled]="push.busy()"
            (click)="push.sendTest()"
          >
            <lucide-icon name="send" /> Send test
          </button>
        }
      </div>

      <ul class="category-list">
        <li class="category-row">
          <div class="category-text">
            <span class="category-name">Renewals</span>
            <span class="category-desc">Remind me when a subscription is about to renew</span>
          </div>
          <mat-slide-toggle
            color="primary"
            [checked]="push.renewalsEnabled()"
            [disabled]="push.busy()"
            (change)="setCategory('renewals', $event.checked)"
            aria-label="Renewal reminders"
          />
        </li>
        <li class="category-row">
          <div class="category-text">
            <span class="category-name">Low balance</span>
            <span class="category-desc">Alert me when a wallet drops to its alert level</span>
          </div>
          <mat-slide-toggle
            color="primary"
            [checked]="push.lowBalanceEnabled()"
            [disabled]="push.busy()"
            (change)="setCategory('low_balance', $event.checked)"
            aria-label="Low balance alerts"
          />
        </li>
        <li class="category-row">
          <div class="category-text">
            <span class="category-name">Budget alerts</span>
            <span class="category-desc">Warn me as spending approaches a budget limit</span>
          </div>
          <mat-slide-toggle
            color="primary"
            [checked]="push.budgetEnabled()"
            [disabled]="push.busy()"
            (change)="setCategory('budget', $event.checked)"
            aria-label="Budget alerts"
          />
        </li>
        <li class="category-row">
          <div class="category-text">
            <span class="category-name">Daily expense summary</span>
            <span class="category-desc">Remind me at 8 AM with yesterday’s total spending</span>
          </div>
          <mat-slide-toggle
            color="primary"
            [checked]="push.dailyExpenseEnabled()"
            [disabled]="push.busy()"
            (change)="setCategory('daily_expense', $event.checked)"
            aria-label="Daily expense summary"
          />
        </li>
        <li class="category-row">
          <div class="category-text">
            <span class="category-name">Daily confirm</span>
            <span class="category-desc">Remind me at 10 PM to confirm today’s transactions</span>
          </div>
          <mat-slide-toggle
            color="primary"
            [checked]="push.dailyConfirmEnabled()"
            [disabled]="push.busy()"
            (change)="setCategory('daily_confirm', $event.checked)"
            aria-label="Daily transaction confirm"
          />
        </li>
      </ul>

      <ul class="notes">
        <li>
          <lucide-icon name="smartphone" />
          <span
            >Turn notifications on separately on each device — your phone and laptop each subscribe
            on their own.</span
          >
        </li>
        <li>
          <lucide-icon name="apple" />
          <span
            >On iPhone/iPad, add rūpa to your Home Screen first (Share → Add to Home Screen), then
            enable notifications.</span
          >
        </li>
      </ul>
    </section>

    <!-- ------------------------------ App lock ------------------- -->
    <section class="app-card settings-card lock-card" aria-label="App lock">
      <div class="section-heading">
        <div class="heading-text">
          <h2>App lock (MPIN)</h2>
        </div>
        <span class="status-chip" [attr.data-status]="mpin.isConfigured() ? 'active' : 'off'">
          {{ mpin.isConfigured() ? 'On' : 'Off' }}
        </span>
      </div>

      @if (mpin.isConfigured()) {
        <p class="status-hint">
          Locked on launch and after {{ autoLockLabel() }} in the background.
        </p>

        <div class="auto-lock">
          <span class="auto-lock-label">Auto-lock after</span>
          <mat-button-toggle-group
            [value]="mpin.autoLockSeconds()"
            (change)="setAutoLock($event.value)"
            aria-label="Auto-lock timeout"
          >
            <mat-button-toggle [value]="0">Immediately</mat-button-toggle>
            <mat-button-toggle [value]="60">1 minute</mat-button-toggle>
            <mat-button-toggle [value]="300">5 minutes</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <div class="primary-actions">
          <button mat-stroked-button type="button" class="pill-btn" (click)="openMpin('change')">
            <lucide-icon name="key-round" /> Change MPIN
          </button>
          <button
            mat-stroked-button
            type="button"
            class="pill-btn danger-btn"
            (click)="openMpin('disable')"
          >
            <lucide-icon name="lock-open" /> Turn off
          </button>
        </div>
      } @else {
        <p class="status-hint">
          Off by default. Set it up to require a PIN every time the app opens.
        </p>

        <div class="primary-actions">
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="pill-btn"
            (click)="openMpin('setup')"
          >
            <lucide-icon name="lock" /> Set up App Lock
          </button>
        </div>
      }

      <ul class="notes">
        <li>
          <lucide-icon name="shield" />
          <span>Forgot your PIN? Reset it from the lock screen while you're signed in.</span>
        </li>
      </ul>
    </section>

    <!-- ------------------------------ Reset user data ------------------- -->
    <section class="app-card settings-card reset-card" aria-label="Reset user data">
      <div class="section-heading">
        <div class="heading-text">
          <h2>Reset user data</h2>
        </div>
        <span class="status-chip" data-status="denied">Danger</span>
      </div>

      <p class="status-hint">
        Start over by deleting selected data like transactions, debts, cards, wallets and more. You
        choose what goes, confirm with your account password, and your sign-in stays the same.
        Deletion can’t be undone.
      </p>

      <div class="primary-actions">
        <button
          mat-flat-button
          type="button"
          class="pill-btn danger-fill"
          (click)="openResetDialog()"
        >
          <lucide-icon name="trash-2" /> Reset data
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .settings-card {
        padding: 16px;
        margin: 0 0 16px;
      }

      .profile-card {
        padding: 16px;
        margin: 0 0 16px;
        position: relative;
      }

      .profile-head {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .avatar-wrapper {
        position: relative;
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        flex: 0 0 auto;
      }
      .avatar-circle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
        font-size: 22px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }
      .edit-card-btn {
        position: absolute;
        bottom: 16px;
        right: 16px;
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
        background: var(--app-ink) !important;
        color: var(--app-ink-inverse) !important;
        border: none;
        display: grid;
        place-items: center;
      }
      .edit-card-btn lucide-icon {
        width: 16px;
        height: 16px;
        color: var(--app-ink-inverse) !important;
      }
      .profile-info {
        min-width: 0;
      }
      .profile-name {
        margin: 0;
        color: var(--app-ink);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .profile-email {
        margin: 2px 0 0;
        color: var(--app-ink-muted);
        font-size: 13px;
        line-height: 1.35;
      }
      .profile-hint {
        margin: 10px 0 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        line-height: 1.45;
      }

      .section-heading {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .heading-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .section-heading h2 {
        margin: 0;
        color: var(--app-ink);
        font-size: 15px;
        font-weight: 700;
      }
      .section-heading p {
        margin: 3px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.4;
      }

      .status-chip {
        flex: 0 0 auto;
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .status-chip[data-status='active'] {
        background: var(--app-positive-soft, rgba(16, 163, 127, 0.12));
        color: var(--app-positive);
      }
      .status-chip[data-status='denied'] {
        background: var(--app-negative-soft, rgba(239, 68, 68, 0.1));
        color: var(--app-negative, #dc2626);
      }
      .status-chip[data-status='dev'] {
        background: rgba(99, 102, 241, 0.12);
        color: var(--app-info, #3f4bb8);
      }
      .feedback {
        margin: 8px 0 0;
        padding: 9px 11px;
        border-radius: 11px;
        background: var(--app-accent-soft);
        color: var(--app-ink);
        font-size: 12.5px;
        line-height: 1.45;
      }
      .feedback.error {
        background: var(--app-negative-soft, rgba(239, 68, 68, 0.1));
        color: var(--app-negative, #dc2626);
      }
      .test-btn {
        color: var(--app-accent) !important;
      }
      .btn-spinner {
        display: inline-block;
        margin-right: 8px;
      }

      .category-list {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        border-top: 1px solid var(--app-hairline);
      }
      .category-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 2px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .category-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .category-name {
        color: var(--app-ink);
        font-size: 13.5px;
        font-weight: 600;
      }
      .category-desc {
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .notes {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .notes li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .notes lucide-icon {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
        margin-top: 1px;
      }

      .lock-card {
        padding: 16px;
      }

      .lock-card .section-heading .heading-icon {
        background: rgba(99, 102, 241, 0.12);
        color: #3f4bb8;
      }

      .danger-btn {
        color: var(--app-negative, #dc2626) !important;
      }

      /* Filled destructive pill — same pattern as ConfirmDialogComponent's
         .destructive-btn (mat-flat-button + negative background). */
      .danger-fill {
        background: var(--app-negative, #dc2626) !important;
        color: #fff !important;
      }

      .auto-lock {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 14px;
      }
      .auto-lock-label {
        color: var(--app-ink);
        font-size: 13px;
        font-weight: 600;
      }
      .auto-lock mat-button-toggle-group {
        align-self: flex-start;
      }
    `,
  ],
})
export class SettingsPage {
  readonly push = inject(PushService);
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  readonly mpin = inject(MpinService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly userEmail = computed(() => this.user()?.email ?? '');
  readonly meta = computed(() => (this.user()?.user_metadata ?? {}) as Record<string, unknown>);
  readonly displayName = computed(() => {
    const meta = this.meta();
    const nameRaw = meta['name'];
    const fullRaw = meta['full_name'];
    const name =
      (typeof nameRaw === 'string' ? nameRaw : '') || (typeof fullRaw === 'string' ? fullRaw : '');
    if (name && name.trim()) return name.trim();
    const email = this.userEmail();
    if (!email) return '—';
    return email.split('@')[0];
  });
  readonly avatarColor = computed(() => {
    const color =
      typeof this.meta()['avatar_color'] === 'string' ? this.meta()['avatar_color'] : '';
    return color || getAvatarColor(this.displayName());
  });
  readonly initials = computed(() => getInitial(this.displayName()));

  statusMeta() {
    return STATUS_META[this.push.status()];
  }

  setCategory(category: PushCategory, enabled: boolean): void {
    void this.push.setCategory(category, enabled);
  }

  openProfileDialog(): void {
    this.dialog.open(ProfileDialogComponent, {
      data: {
        name: this.displayName(),
        email: this.userEmail(),
        avatarColor: this.avatarColor(),
      },
    });
  }

  openMpin(mode: MpinDialogMode): void {
    this.dialog.open(MpinDialogComponent, {
      data: { mode },
      disableClose: true,
    });
  }

  openResetDialog(): void {
    this.dialog.open(ResetDataDialogComponent, { disableClose: true });
  }

  setAutoLock(seconds: number): void {
    this.mpin.setAutoLock(seconds);
  }

  autoLockLabel(): string {
    switch (this.mpin.autoLockSeconds()) {
      case 0:
        return 'immediately';
      case 300:
        return '5 minutes';
      default:
        return '1 minute';
    }
  }
}
