import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { BankAccount } from '../../core/models/domain.models';

export interface BankAccountDetailsData {
  card: BankAccount;
}

@Component({
  selector: 'app-bank-account-details-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    LucideAngularModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div class="header-main">
          <div class="icon-badge" [class.credit]="card.card_type === 'credit'">
            <lucide-icon [name]="card.card_type === 'credit' ? 'credit-card' : 'building-2'" />
          </div>
          <div>
            <h2 mat-dialog-title class="dialog-title">{{ card.bank_name }}</h2>
            <p class="dialog-subtitle">{{ card.account_name }}</p>
          </div>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Close dialog" class="close-btn">
          <lucide-icon name="x" />
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <!-- Physical Card Badge -->
        <div class="card-badge" [attr.data-theme]="card.theme || 'emerald'">
          <div class="card-top">
            <span class="bank-tag">{{ card.bank_name }}</span>
            <span class="type-tag">{{ card.card_type | uppercase }}</span>
          </div>
          <div class="card-number">
            •••• •••• •••• {{ card.card_number_masked }}
          </div>
          <div class="card-bottom">
            <div class="card-holder">
              <span class="lbl">HOLDER</span>
              <span class="val">{{ card.cardholder_name }}</span>
            </div>
            <div class="card-exp">
              <span class="lbl">EXPIRES</span>
              <span class="val">{{ card.expiry_date }}</span>
            </div>
            <div class="card-net">
              {{ card.payment_network | uppercase }}
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Account / Nickname</span>
            <span class="detail-value">{{ card.account_name }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">Card Type</span>
            <span class="detail-value badge-val">{{ card.card_type | uppercase }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">Payment Network</span>
            <span class="detail-value badge-val">{{ card.payment_network | uppercase }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">Card Number</span>
            <span class="detail-value mono">•••• •••• •••• {{ card.card_number_masked }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">Cardholder</span>
            <span class="detail-value">{{ card.cardholder_name }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">Expiry Date</span>
            <span class="detail-value mono">{{ card.expiry_date }}</span>
          </div>

          @if (card.balance !== undefined) {
            <div class="detail-item full-width highlight">
              <span class="detail-label">Current Card Balance</span>
              <span class="detail-value amount">₹{{ card.balance | number:'1.2-2' }}</span>
            </div>
          }

          @if (card.credit_limit) {
            <div class="detail-item highlight">
              <span class="detail-label">Credit Limit</span>
              <span class="detail-value amount">₹{{ card.credit_limit | number:'1.2-2' }}</span>
            </div>
          }
        </div>
      </mat-dialog-content>

      <div mat-dialog-actions class="dialog-actions">
        <button mat-button mat-dialog-close class="btn-secondary">Close</button>
        <button mat-flat-button (click)="onEdit()" class="btn-primary">
          <lucide-icon name="pencil" />
          <span>Edit Details</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 24px;
        max-width: 480px;
        background: var(--app-surface, #ffffff);
        color: var(--app-ink, #0f172a);
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .header-main {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .icon-badge {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: var(--app-hairline, #f1f5f9);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-ink, #0f172a);
      }
      .icon-badge.credit {
        background: rgba(99, 102, 241, 0.1);
        color: #6366f1;
      }
      .dialog-title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.2;
      }
      .dialog-subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--app-ink-muted, #64748b);
      }
      .close-btn {
        color: var(--app-ink-muted, #64748b);
      }

      /* Card Badge visual */
      .card-badge {
        padding: 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        color: #ffffff;
        margin-bottom: 20px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card-badge[data-theme='emerald'] { background: linear-gradient(135deg, #064e3b 0%, #022c22 100%); }
      .card-badge[data-theme='indigo'] { background: linear-gradient(135deg, #312e81 0%, #1e1b4b 100%); }
      .card-badge[data-theme='rose'] { background: linear-gradient(135deg, #881337 0%, #4c0519 100%); }
      .card-badge[data-theme='amber'] { background: linear-gradient(135deg, #78350f 0%, #451a03 100%); }
      .card-badge[data-theme='violet'] { background: linear-gradient(135deg, #581c87 0%, #3b0764 100%); }

      .card-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .bank-tag { font-weight: 700; font-size: 14px; letter-spacing: 0.5px; }
      .type-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.2); text-transform: uppercase; }

      .card-number {
        font-family: monospace;
        font-size: 17px;
        letter-spacing: 2px;
        font-weight: 600;
      }

      .card-bottom {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .lbl { font-size: 9px; color: rgba(255, 255, 255, 0.6); display: block; letter-spacing: 0.5px; }
      .val { font-size: 12px; font-weight: 600; text-transform: uppercase; }
      .card-net { font-size: 12px; font-weight: 800; font-style: italic; }

      /* Grid */
      .details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .detail-item {
        padding: 10px 12px;
        background: var(--app-surface-variant, #f8fafc);
        border: 1px solid var(--app-hairline, #e2e8f0);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .detail-item.full-width { grid-column: span 2; }
      .detail-item.highlight { background: rgba(99, 102, 241, 0.05); border-color: rgba(99, 102, 241, 0.2); }
      .detail-label { font-size: 11px; font-weight: 600; color: var(--app-ink-muted, #64748b); text-transform: uppercase; }
      .detail-value { font-size: 14px; font-weight: 600; color: var(--app-ink, #0f172a); }
      .detail-value.mono { font-family: monospace; }
      .detail-value.amount { font-size: 16px; font-weight: 700; color: #10b981; }

      .dialog-actions {
        margin-top: 24px;
        padding: 0;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      .btn-secondary {
        border-radius: 10px;
      }
      .btn-primary {
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--app-ink, #0f172a);
        color: #ffffff;
      }
    `,
  ],
})
export class BankAccountDetailsDialogComponent {
  readonly card: BankAccount;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: BankAccountDetailsData,
    private dialogRef: MatDialogRef<BankAccountDetailsDialogComponent>,
  ) {
    this.card = data.card;
  }

  onEdit(): void {
    this.dialogRef.close({ edit: true });
  }
}
