import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';

/** Direction passed to the signedMoney pipe: 'in' → +, 'out' → −, null → plain. */
export type ReportDetailTone = 'in' | 'out' | null;

export interface ReportDetailRow {
  id: string;
  /** Optional lucide icon shown in a chip (e.g. the category icon). */
  icon?: string;
  /** Chip background colour; falls back to the accent tint when omitted. */
  iconColor?: string;
  title: string;
  /** Secondary line, e.g. payment mode or reason. */
  meta?: string;
  /** Date-only ISO string rendered as 'EEE, MMM d'. */
  date?: string;
  amount?: number;
  tone?: ReportDetailTone;
}

export interface ReportDetailData {
  title: string;
  subtitle?: string;
  /** Header icon (lucide name). */
  icon?: string;
  /** Header icon chip background colour; falls back to the accent tint. */
  iconColor?: string;
  total?: number;
  totalTone?: ReportDetailTone;
  totalLabel?: string;
  rows: ReportDetailRow[];
  emptyText?: string;
}

/**
 * Generic drill-down list used by every Reports component: opens with the
 * summary of the tapped item and lists the underlying records behind it.
 */
@Component({
  selector: 'app-report-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    LucideAngularModule,
    SignedMoneyPipe,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div class="header-main">
          <div>
            <h2 mat-dialog-title class="dialog-title">{{ data.title }}</h2>
            @if (data.subtitle) {
              <p class="dialog-subtitle">{{ data.subtitle }}</p>
            }
          </div>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Close dialog" class="close-btn">
          <lucide-icon name="x" style="vertical-align: unset;" />
        </button>
      </div>

      @if (data.total != null) {
        <div class="summary">
          <span class="summary-label">{{ data.totalLabel || 'Total' }}</span>
          <span
            class="summary-value"
            [class.pos]="data.totalTone === 'in'"
            [class.neg]="data.totalTone === 'out'"
          >
            {{ data.total | signedMoney: data.totalTone }}
          </span>
        </div>
      }

      <mat-dialog-content class="dialog-content" style="padding: 0 16px 12px">
        @if (data.rows.length > 0) {
          <ul class="detail-list">
            @for (row of data.rows; track row.id) {
              <li class="detail-row">
                @if (row.icon) {
                  @if (row.iconColor) {
                    <span class="row-icon solid" [style.background]="row.iconColor">
                      <lucide-icon [name]="row.icon" />
                    </span>
                  } @else {
                    <span class="row-icon tint">
                      <lucide-icon [name]="row.icon" />
                    </span>
                  }
                }
                <div class="row-body">
                  <span class="row-title">{{ row.title }}</span>
                  @if (row.date || row.meta) {
                    <span class="row-meta"
                      >{{ row.date ? (row.date | date: 'EEE, MMM d') : ''
                      }}{{ row.date && row.meta ? ' · ' : '' }}{{ row.meta ?? '' }}</span
                    >
                  }
                </div>
                @if (row.amount != null) {
                  <span
                    class="row-amount"
                    [class.pos]="row.tone === 'in'"
                    [class.neg]="row.tone === 'out'"
                  >
                    {{ row.amount | signedMoney: row.tone }}
                  </span>
                }
              </li>
            }
          </ul>
        } @else {
          <div class="empty">{{ data.emptyText || 'Nothing to show here yet.' }}</div>
        }
      </mat-dialog-content>
    </div>
  `,
  styles: [
    `
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
      .dialog-container {
        padding: 0 24px 24px 24px;
        max-width: 480px;
        background: var(--app-surface, #ffffff);
        color: var(--app-ink, #0f172a);
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .header-main {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .icon-badge {
        width: 44px;
        height: 44px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-badge.solid { color: #fff; }
      .icon-badge lucide-icon {
        width: 20px;
        height: 20px;
      }
      .dialog-title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dialog-subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--app-ink-muted, #64748b);
      }
      .close-btn {
        color: var(--app-ink-muted, #64748b);
        flex: 0 0 auto;
      }

      .dialog-content {
        max-height: min(60vh, 460px);
        overflow-y: auto;
      }

      .summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        background: var(--app-canvas);
        border-radius: 12px;
        margin: 8px 0;
      }
      .summary-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-ink-muted);
      }
      .summary-value {
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .summary-value.pos { color: var(--app-positive); }
      .summary-value.neg { color: var(--app-negative); }

      .detail-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .detail-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 2px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .detail-row:last-child {
        border-bottom: 0;
        padding-bottom: 4px;
      }
      .row-icon {
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        border-radius: 10px;
        display: grid;
        place-items: center;
      }
      .row-icon.solid { color: #fff; }
      .row-icon.tint { background: var(--app-accent-soft); color: var(--app-accent); }
      .row-icon lucide-icon { width: 16px; height: 16px; }

      .row-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .row-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--app-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row-meta {
        font-size: 12px;
        color: var(--app-ink-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row-amount {
        font-size: 14px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .row-amount.pos { color: var(--app-positive); }
      .row-amount.neg { color: var(--app-negative); }

      .empty {
        color: var(--app-ink-muted);
        font-size: 14px;
        text-align: center;
        padding: 20px 0;
      }
    `,
  ],
})
export class ReportDetailDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ReportDetailData) {}
}
