import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

export interface ConfirmDialogData {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: string;
}

/**
 * Themed confirmation dialog to replace window.confirm().
 * Usage:
 *   ConfirmDialogService.confirm(dialog, { title: '…' }) → Promise<boolean>
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule],
  template: `
    <div class="wrap">
      @if (data.icon) {
        <div
          class="icon"
          [class.destructive]="data.destructive"
        >
          <lucide-icon [name]="data.icon!" />
        </div>
      }

      <h2 mat-dialog-title>{{ data.title }}</h2>
      @if (data.message) {
        <mat-dialog-content class="msg">
          {{ data.message }}
        </mat-dialog-content>
      }

      <mat-dialog-actions align="end" class="actions">
        <button mat-button (click)="close(false)">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          mat-flat-button
          [class.destructive-btn]="data.destructive"
          [color]="data.destructive ? undefined : 'primary'"
          (click)="close(true)"
        >
          {{ data.confirmLabel ?? 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-width: 300px;
        max-width: 400px;
        padding: 8px 4px 4px;
      }
      .icon {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        margin: 0 auto 12px;
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
        margin: 0 0 6px !important;
        font-size: 18px !important;
      }
      .msg {
        text-align: center;
        color: var(--app-ink-muted);
        font-size: 14px;
        padding: 0 16px 4px !important;
      }
      .actions {
        padding: 12px 8px 4px !important;
        gap: 8px;
      }
      .destructive-btn {
        background: var(--app-negative) !important;
        color: #fff !important;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  private readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  close(result: boolean): void {
    this.ref.close(result);
  }
}

/**
 * Helper — call this instead of window.confirm().
 */
export function openConfirm(
  dialog: MatDialog,
  data: ConfirmDialogData,
): Promise<boolean> {
  return new Promise((resolve) => {
    const ref = dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data },
    );
    ref.afterClosed().subscribe((r) => resolve(!!r));
  });
}
