import { Component, inject } from '@angular/core';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { CONTACT_INFO } from '../../core/contact-info';

/**
 * Small themed dialog with two rows: mail and call.
 * Use `openContactDialog(dialog)` from any component to trigger it.
 */
@Component({
  selector: 'app-contact-dialog',
  standalone: true,
  imports: [MatDialogModule, LucideAngularModule],
  template: `
    <div class="wrap">
      <div class="head">
        <h2>Contact us</h2>
        <p>Pick a way to reach out — we'll get back to you shortly.</p>
      </div>

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

      <mat-dialog-actions align="end" class="actions">
        <button mat-dialog-close class="close-btn">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-width: 300px;
        max-width: 380px;
        padding: 24px;
      }
      .head {
        text-align: center;
        margin-bottom: 16px;
      }
      .head h2 {
        margin: 0 0 6px;
        font-size: 18px;
        font-weight: 700;
        color: var(--app-ink);
      }
      .head p {
        margin: 0;
        font-size: 13px;
        color: var(--app-ink-muted);
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

      .actions {
        padding: 12px 4px 0 !important;
      }
      .close-btn {
        border: 0;
        background: transparent;
        color: var(--app-ink-muted);
        font: inherit;
        font-weight: 500;
        padding: 8px 14px;
        border-radius: 999px;
        cursor: pointer;

        &:hover { color: var(--app-ink); background: var(--app-canvas); }
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
