import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { PushCategory, PushService, PushStatus } from '../../core/services/push.service';

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
    `,
  ],
})
export class SettingsPage {
  readonly push = inject(PushService);

  statusMeta() {
    return STATUS_META[this.push.status()];
  }

  setCategory(category: PushCategory, enabled: boolean): void {
    void this.push.setCategory(category, enabled);
  }
}
