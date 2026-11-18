import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Explicit consent prompt shown before a receipt image is sent to an
 * external AI provider for scanning.
 *
 * Returns `true` from `openAiConsent()` only when the user taps "Allow".
 * Any other outcome (cancel, backdrop click, Escape) resolves to `false`,
 * so scanning stays blocked unless consent is explicitly given.
 */
@Component({
  selector: 'app-ai-consent-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-text">
          <h2 mat-dialog-title>Scan receipts with AI?</h2>
          <p class="dialog-subtitle">How rūpa reads your receipt photos.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <p>
          To read the amount and merchant, rūpa sends the photo you choose to an
          <strong>external AI provider</strong>.
        </p>
        <ul>
          <li>The image leaves this device and is processed by that provider.</li>
          <li>Only the extracted text (merchant &amp; total) comes back — the image isn’t stored by rūpa.</li>
          <li>You can change this choice later in Settings.</li>
        </ul>
        <p class="decline-note">
          Prefer not to? Choose <strong>Don’t allow</strong> and enter the details manually instead.
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" class="cancel-btn" (click)="close(false)">
          Don’t allow
        </button>
        <button mat-flat-button color="primary" type="button" (click)="close(true)">
          Allow
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        max-width: 480px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header — matches the app's standard dialog header (icon tile + text). */
      .dialog-header {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 4px 16px 14px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .header-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .header-icon lucide-icon {
        width: 19px;
        height: 19px;
      }
      .header-text {
        min-width: 0;
      }
      h2 {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
      }
      .dialog-subtitle {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .dialog-content {
        padding: 16px !important;
        color: var(--app-ink-muted);
        font-size: 14px;
        line-height: 1.5;
      }
      .dialog-content p {
        margin: 0 0 10px;
      }
      .dialog-content ul {
        margin: 0 0 10px;
        padding-left: 18px;
      }
      .dialog-content li {
        margin-bottom: 4px;
      }
      .dialog-content strong {
        color: var(--app-ink);
      }
      .decline-note {
        margin-bottom: 0 !important;
        font-size: 13px;
      }

      .dialog-actions {
        padding: 0 16px 12px;
      }
      .dialog-actions button {
        border-radius: 999px;
      }
      .cancel-btn {
        color: var(--app-ink-muted) !important;
      }
    `,
  ],
})
export class AiConsentDialogComponent {
  private readonly ref = inject<MatDialogRef<AiConsentDialogComponent, boolean>>(
    MatDialogRef,
  );

  close(result: boolean): void {
    this.ref.close(result);
  }
}

/**
 * Opens the AI consent dialog and resolves `true` only on an explicit "Allow".
 */
export function openAiConsent(
  dialog: import('@angular/material/dialog').MatDialog,
): Promise<boolean> {
  return new Promise((resolve) => {
    const ref = dialog.open<AiConsentDialogComponent, unknown, boolean>(
      AiConsentDialogComponent,
    );
    ref.afterClosed().subscribe((r) => resolve(r === true));
  });
}
