import { Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MpinService } from '../../core/services/mpin.service';
import { MpinDialogComponent, MpinDialogMode } from './mpin-dialog.component';

/**
 * App Lock (MPIN) configuration — reached from the Settings menu item.
 * Disabled by default; the user opts in here.
 */
@Component({
  selector: 'app-app-lock-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header title="App lock" subtitle="Protect rūpa with a 4 or 6-digit MPIN" />

    <section class="app-card lock-card" aria-label="App lock">
      <div class="section-heading">
        <div class="heading-icon"><lucide-icon name="lock" /></div>
        <div class="heading-text">
          <h2>App lock (MPIN)</h2>
          <p>Require a PIN when the app launches or returns from the background.</p>
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
  `,
  styles: [
    `
      .lock-card { padding: 16px; }

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
        background: rgba(99, 102, 241, .12);
        color: #3f4bb8;
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
      .status-chip[data-status='active'] {
        background: var(--app-positive-soft, rgba(16, 163, 127, .12));
        color: var(--app-positive);
      }

      .status-hint {
        margin: 12px 0 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        line-height: 1.5;
      }

      .primary-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .pill-btn {
        min-height: 38px;
        border-radius: 999px !important;
        font-size: 13px;
        font-weight: 600;
      }
      .pill-btn lucide-icon { width: 16px; height: 16px; margin-right: 6px; }
      .danger-btn { color: var(--app-negative, #dc2626) !important; }

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
export class AppLockPage {
  readonly mpin = inject(MpinService);

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Browser / Android-hardware back from this screen must land on the
    // dashboard — never on whichever settings screen happened to be open
    // before. The router's own popstate listener is registered first (at
    // bootstrap), so this one runs second and re-replaces the popped entry
    // with /dashboard.
    const redirectBack = () => {
      this.dialog.closeAll();
      void this.router.navigate(['/dashboard'], { replaceUrl: true });
    };
    window.addEventListener('popstate', redirectBack);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('popstate', redirectBack),
    );
  }

  openMpin(mode: MpinDialogMode): void {
    this.dialog.open(MpinDialogComponent, {
      data: { mode },
      disableClose: true,
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
