import { Component, inject } from '@angular/core';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

import { CONTACT_INFO } from '../../core/contact-info';

/**
 * Small themed dialog with two rows: mail and call.
 * Use `openContactDialog(dialog)` from any component to trigger it.
 */
@Component({
  selector: 'app-contact-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule],
  template: `
    <div class="dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-text-group">
          <h2 mat-dialog-title class="dialog-title">Contact us</h2>
          <p class="dialog-subtitle">Pick a way to reach out — we'll get back to you shortly</p>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <div class="options">
          <a class="opt" [href]="mailtoHref">
            <div class="opt-icon">
              <lucide-icon name="mail" />
            </div>
            <div class="opt-body">
              <div class="opt-label">Email</div>
              <div class="opt-value">{{ contact.email }}</div>
            </div>
          </a>

          <a class="opt" [href]="telHref">
            <div class="opt-icon">
              <lucide-icon name="phone" />
            </div>
            <div class="opt-body">
              <div class="opt-label">Phone</div>
              <div class="opt-value">{{ contact.phone }}</div>
            </div>
          </a>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-flat-button color="primary" mat-dialog-close class="close-btn">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        max-width: 420px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header */
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0 16px 12px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .dialog-title {
        font-size: 18px !important;
        font-weight: 700 !important;
        color: var(--app-ink) !important;
        margin: 0 !important;
        line-height: 1.2 !important;
        padding: 0 !important;
      }
      .dialog-subtitle {
        font-size: 12px;
        color: var(--app-ink-muted);
        margin: 3px 0 0;
      }

      .dialog-content {
        padding-top: 16px !important;
        padding-bottom: 16px !important;
        min-width: 280px;
      }

      .options {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .opt {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--app-input-bg);
        text-decoration: none;
        color: var(--app-ink);
        transition: background .12s ease, transform .1s ease;
      }
      .opt:hover { background: var(--app-canvas); }
      .opt:active { transform: scale(0.99); }

      .opt-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: var(--app-ink-dark);
        color: #ffffff;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }
      .opt-icon lucide-icon { width: 20px; height: 20px; }

      .opt-body { min-width: 0; }
      .opt-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--app-ink-muted);
      }
      .opt-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--app-ink);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dialog-actions {
        padding-top: 12px;
      }
      .close-btn {
        background: var(--app-ink-dark) !important;
        color: #ffffff !important;
        border-radius: var(--app-radius-md) !important;
        font-weight: 600 !important;
      }
    `,
  ],
})
export class ContactDialogComponent {
  private readonly ref = inject(MatDialogRef<ContactDialogComponent>);
  readonly contact = CONTACT_INFO;

  get mailtoHref(): string {
    return `mailto:${this.contact.email}?subject=${encodeURIComponent('rūpa — hello')}`;
  }
  get telHref(): string {
    return `tel:${this.contact.phoneE164}`;
  }
}

/** Convenience helper — inject MatDialog at the call site and pass it in. */
export function openContactDialog(dialog: MatDialog): void {
  dialog.open(ContactDialogComponent);
}
