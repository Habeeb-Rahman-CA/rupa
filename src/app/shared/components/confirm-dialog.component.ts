import { Component, computed, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { APP_ICONS } from '../lucide-icons';

const REGISTERED_ICONS = new Set<string>(
  Object.keys(APP_ICONS).map((k) =>
    k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
  ),
);

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
      @if (resolvedIcon()) {
        <div
          class="icon"
          [class.destructive]="data.destructive"
        >
          <lucide-icon [name]="resolvedIcon()!" />
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
        padding: 16px;
      }
      .icon {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        margin: 0 auto;
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
        margin: 0 !important;
        font-size: 18px !important;
        padding: 0;
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

  readonly resolvedIcon = computed<string | null>(() => {
    const raw = this.data.icon;
    if (raw && REGISTERED_ICONS.has(raw.toLowerCase())) {
      return raw;
    }
    if (this.data.destructive) {
      return 'trash-2';
    }
    return raw ? 'check-circle' : null;
  });

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
