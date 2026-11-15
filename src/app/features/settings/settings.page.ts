import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { PushCategory, PushService, PushStatus } from '../../core/services/push.service';
import { MpinService } from '../../core/services/mpin.service';
import { MpinDialogComponent, MpinDialogMode } from './mpin-dialog.component';

const STATUS_META: Record<PushStatus, { label: string; hint: string }> = {
  unsupported: {
    label: 'Not supported',
    hint: 'This browser does not support web push notifications. Try Chrome, Edge, or the installed (Home Screen) app on iOS.',
  },
  dev: {
    label: 'Dev only',
    hint: 'Push notifications run in the production build — the service worker is disabled while developing, so they cannot be enabled here.',
  },
  denied: {
    label: 'Blocked',
    hint: 'Notifications are blocked for this site. Re-enable them in your browser’s site settings (the padlock / address bar), then come back and turn them on.',
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
  imports: [
    MatButtonModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    LucideAngularModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header title="Settings" subtitle="App preferences and notifications" />

    <!-- ------------------------------ Push notifications ------------------- -->
    <section class="app-card notify-card" aria-label="Push notifications">
      <div class="section-heading">
        <div class="heading-icon"><lucide-icon name="bell" /></div>
        <div class="heading-text">
          <h2>Push notifications</h2>
          <p>Renewal reminders and low-balance alerts, delivered even when the app is closed.</p>
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
      </ul>

      <ul class="notes">
        <li>
          <lucide-icon name="smartphone" />
          <span>Each device subscribes separately — turn notifications on on your phone and laptop independently.</span>
        </li>
        <li>
          <lucide-icon name="apple" />
          <span>On iPhone/iPad, add rūpa to your Home Screen first (Share → Add to Home Screen), then enable notifications.</span>
        </li>
        <li>
          <lucide-icon name="shield-check" />
          <span>Notification content is generated on the server; your VAPID private key and data never leave the backend.</span>
        </li>
      </ul>
    </section>

    <!-- -------------------------------- App lock (MPIN) --------------------- -->
    <section class="app-card notify-card" aria-label="App lock">
      <div class="section-heading">
        <div class="heading-icon"><lucide-icon name="lock" /></div>
        <div class="heading-text">
          <h2>App lock (MPIN)</h2>
          <p>Require a 4 or 6-digit PIN when the app launches or returns from the background.</p>
        </div>
        <span class="status-chip" [attr.data-status]="mpin.isConfigured() ? 'active' : 'off'">
          {{ mpin.isConfigured() ? 'On' : 'Off' }}
        </span>
      </div>

      @if (mpin.isConfigured()) {
        <p class="status-hint">
          Locked on launch and after {{ autoLockLabel() }} in the background. The keypad layout
          is randomized every time it appears.
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
          Off by default. When enabled, your MPIN is stored only as a salted
          PBKDF2 hash (Web Crypto) — never in plain text — and routes stay
          locked until it is entered.
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
          <span>Forgotten PIN: reset it from the lock screen — you'll be asked to confirm while signed in.</span>
        </li>
        <li>
          <lucide-icon name="smartphone" />
          <span>The MPIN is stored on this device only; clearing browser data removes it.</span>
        </li>
      </ul>
    </section>
  `,
  styles: [
    `
      .notify-card { padding: 16px; }

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
      .heading-icon lucide-icon { width: 19px; height: 19px; }
      .heading-text { min-width: 0; flex: 1 1 auto; }
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
        letter-spacing: .05em;
        text-transform: uppercase;
      }
      .status-chip[data-status='active'] { background: var(--app-positive-soft, rgba(16, 163, 127, .12)); color: var(--app-positive); }
      .status-chip[data-status='denied'] { background: var(--app-negative-soft, rgba(239, 68, 68, .1)); color: var(--app-negative, #dc2626); }
      .status-chip[data-status='dev'] { background: rgba(99, 102, 241, .12); color: #3f4bb8; }

      .status-hint {
        margin: 12px 0 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        line-height: 1.5;
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
      .feedback.error { background: var(--app-negative-soft, rgba(239, 68, 68, .1)); color: var(--app-negative, #dc2626); }

      .primary-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .pill-btn {
        min-height: 38px;
        border-radius: 999px !important;
        font-size: 13px;
        font-weight: 600;
      }
      .pill-btn lucide-icon { width: 16px; height: 16px; margin-right: 6px; }
      .test-btn { color: var(--app-accent) !important; }
      .btn-spinner { display: inline-block; margin-right: 8px; }

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
      .category-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
      .category-name { color: var(--app-ink); font-size: 13.5px; font-weight: 600; }
      .category-desc { color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }

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
      .notes lucide-icon { width: 15px; height: 15px; flex: 0 0 auto; margin-top: 1px; }

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
      .danger-btn { color: var(--app-negative, #dc2626) !important; }
      .status-chip[data-status='off'] {
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
      }
    `,
  ],
})
export class SettingsPage {
  readonly push = inject(PushService);
  readonly mpin = inject(MpinService);

  private readonly dialog = inject(MatDialog);

  statusMeta() {
    return STATUS_META[this.push.status()];
  }

  setCategory(category: PushCategory, enabled: boolean): void {
    void this.push.setCategory(category, enabled);
  }

  // ---------------------------------------------------------- app lock

  openMpin(mode: MpinDialogMode): void {
    const ref = this.dialog.open(MpinDialogComponent, {
      data: { mode },
      disableClose: true,
    });
    ref.afterClosed().subscribe(() => {
      // Signals in MpinService already reflect the outcome — nothing to do.
    });
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
