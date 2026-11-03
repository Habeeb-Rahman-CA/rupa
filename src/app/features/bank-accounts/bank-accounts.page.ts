import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';

import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccount } from '../../core/models/domain.models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { BankAccountDialogComponent } from './bank-account-dialog.component';
import { BankAccountDetailsDialogComponent } from './bank-account-details-dialog.component';
import { CardsTabsComponent } from '../../shared/components/cards-tabs.component';

@Component({
  selector: 'app-bank-accounts-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatTooltipModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
    CardsTabsComponent,
  ],
  template: `
    <!-- Top Page Header matching system standards -->
    <app-page-header
      title="Cards"
      subtitle="Manage your cards, accounts, and wallets"
    >
      @if (cards().length > 1) {
        <a class="transfer-link" routerLink="/transfers">
          <lucide-icon name="arrow-left-right" />
          <span>Transfer</span>
        </a>
      }
      <button
        class="add-btn"
        type="button"
        (click)="openAddDialog()"
        aria-label="Add card"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    <app-cards-tabs />

    <!-- Cards Display Grid -->
    @if (isLoading() && cards().length === 0) {
      <app-loading-state label="Loading bank accounts…" />
    } @else if (cards().length === 0) {
      <app-empty-state
        icon="credit-card"
        title="No bank accounts or cards yet"
        message="Add your first card to organize your bank accounts, debit, and credit cards."
      />
      <div class="empty-actions-wrap">
        <button mat-flat-button color="primary" (click)="openAddDialog()" class="primary-action-btn">
          <lucide-icon name="plus" />
          Add Your First Card
        </button>
      </div>
    } @else {
      <section class="overview app-card">
        <div class="overview-icon"><lucide-icon name="credit-card" /></div>
        <div>
          <span class="micro-label">Cards balance</span>
          <strong>{{ totalBalance() | signedMoney }}</strong>
        </div>
        <span class="overview-count">{{ cards().length }} card{{ cards().length === 1 ? '' : 's' }}</span>
      </section>

      <div class="cards-grid">
        @for (card of cards(); track card.id) {
          <section class="card-wrapper app-card">
            <!-- Physical Card Container -->
            <div
              class="bank-card"
              [attr.data-theme]="card.theme || 'blue'"
              (click)="viewDetails(card)"
            >
              <!-- Card Top Header -->
              <div class="card-header">
                <div class="bank-brand">
                  <lucide-icon name="landmark" class="landmark-icon" />
                  <span class="bank-name">{{ card.bank_name }}</span>
                </div>

                <div class="header-right-badges">
                  @if (card.is_primary) {
                    <span class="primary-badge" matTooltip="Primary Payment Card">
                      <lucide-icon name="star" /> Primary
                    </span>
                  }
                  <lucide-icon name="wifi" class="contactless-icon" title="Contactless Enabled" />
                </div>
              </div>

              <!-- Card Body (EMV Chip & Network Logo) -->
              <div class="card-body">
                <div class="emv-chip">
                  <div class="chip-line"></div>
                  <div class="chip-line"></div>
                </div>

                <div class="network-logo">
                  @if (card.payment_network === 'visa') {
                    <span class="visa-text">VISA</span>
                  } @else if (card.payment_network === 'mastercard') {
                    <div class="mc-circles">
                      <span class="mc-circle red"></span>
                      <span class="mc-circle yellow"></span>
                    </div>
                  } @else if (card.payment_network === 'rupay') {
                    <span class="rupay-text">RuPay</span>
                  } @else if (card.payment_network === 'amex') {
                    <span class="amex-text">AMEX</span>
                  } @else {
                    <span class="generic-network">{{ card.payment_network | uppercase }}</span>
                  }
                </div>
              </div>

              <!-- Card Number -->
              <div class="card-number">
                •••• •••• •••• {{ card.card_number_masked }}
              </div>

              <!-- Card Bottom Meta -->
              <div class="card-footer">
                <div class="cardholder">
                  <div class="meta-label">CARD HOLDER</div>
                  <div class="meta-value">{{ card.cardholder_name }}</div>
                </div>

                <div class="expiry">
                  <div class="meta-label">EXPIRES</div>
                  <div class="expiry-pill">{{ card.expiry_date }}</div>
                </div>

                <div class="card-type-tag" [attr.data-type]="card.card_type">
                  {{ card.card_type | uppercase }}
                </div>
              </div>
            </div>

            <!-- Card Control Actions Bar below card -->
            <div class="card-actions-bar">
              <div class="card-nickname">
                <span>{{ card.account_name }}</span>
                @if (card.balance !== undefined) {
                  <span class="card-balance-tag">
                    ₹{{ card.balance | number:'1.0-0' }}
                  </span>
                }
              </div>

              <div class="action-buttons">
                @if (!card.is_primary) {
                  <button
                    mat-icon-button
                    class="action-btn"
                    (click)="setPrimary(card)"
                    matTooltip="Set as Primary"
                  >
                    <lucide-icon name="star" />
                  </button>
                }

                <button
                  mat-icon-button
                  class="action-btn"
                  (click)="openEditDialog(card)"
                  matTooltip="Edit Card Details"
                >
                  <lucide-icon name="pencil" />
                </button>

                <button
                  mat-icon-button
                  class="action-btn delete"
                  (click)="confirmDelete(card)"
                  matTooltip="Remove Card"
                >
                  <lucide-icon name="trash-2" />
                </button>
              </div>
            </div>
          </section>
        }
      </div>
    }
  `,
  styles: [
    `
      /* Empty Actions Wrap */
      .transfer-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 13px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }
      .transfer-link lucide-icon { width: 17px; height: 17px; }
      @media (max-width: 480px) {
        .transfer-link span { display: none; }
        .transfer-link { width: 40px; justify-content: center; padding: 0; }
      }
      .empty-actions-wrap {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      .primary-action-btn {
        border-radius: 999px !important;
        padding: 0 24px !important;
        font-weight: 700 !important;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .overview { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 14px 16px; }
      .overview-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 14px; background: var(--app-accent-soft); color: var(--app-accent); }
      .overview-icon lucide-icon { width: 19px; height: 19px; }
      .overview strong { display: block; margin-top: 2px; color: var(--app-ink); font-size: 20px; font-variant-numeric: tabular-nums; }
      .overview-count { margin-left: auto; color: var(--app-ink-muted); font-size: 12px; }

      /* Cards Grid */
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
        padding-bottom: 18px;
      }
      @media (max-width: 480px) {
        .cards-grid {
          grid-template-columns: 1fr;
          gap: 14px;
        }
      }
      .card-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        padding: 12px;
        overflow: hidden;
      }

      /* Individual Physical Bank Card */
      .bank-card {
        position: relative;
        width: 100%;
        border-radius: 20px;
        padding: 22px;
        color: #ffffff;
        box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.22);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 210px;
        cursor: pointer;
        transition: transform 0.25s ease, box-shadow 0.25s ease;
        overflow: hidden;

        &:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.3);
        }

        &::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.14) 0%, transparent 60%);
          pointer-events: none;
        }
      }

      /* Themes */
      .bank-card[data-theme='blue'] {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
      }
      .bank-card[data-theme='purple'] {
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #4c1d95 100%);
      }
      .bank-card[data-theme='dark'] {
        background: linear-gradient(135deg, #1f2937 0%, #111827 60%, #030712 100%);
      }
      .bank-card[data-theme='emerald'] {
        background: linear-gradient(135deg, #059669 0%, #047857 50%, #064e3b 100%);
      }
      .bank-card[data-theme='sunset'] {
        background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%);
      }
      .bank-card[data-theme='gold'] {
        background: linear-gradient(135deg, #d97706 0%, #b45309 50%, #78350f 100%);
      }
      .bank-card[data-theme='rose'] {
        background: linear-gradient(135deg, #e11d48 0%, #be123c 50%, #881337 100%);
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 2;
      }
      .bank-brand {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .landmark-icon {
        width: 22px;
        height: 22px;
      }
      .bank-name {
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.5px;
      }
      .header-right-badges {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .primary-badge {
        font-size: 10px;
        font-weight: 800;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
        padding: 2px 8px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        gap: 4px;

        lucide-icon {
          width: 12px;
          height: 12px;
          fill: currentColor;
        }
      }
      .contactless-icon {
        width: 22px;
        height: 22px;
        opacity: 0.85;
        transform: rotate(90deg);
      }

      .card-body {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 16px 0;
        z-index: 2;
      }

      .emv-chip {
        width: 44px;
        height: 32px;
        background: linear-gradient(135deg, #fde047 0%, #eab308 100%);
        border-radius: 6px;
        padding: 5px;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.35);
      }
      .chip-line {
        height: 1px;
        background: rgba(0, 0, 0, 0.35);
        width: 100%;
      }

      /* Network Styling */
      .visa-text {
        font-size: 22px;
        font-weight: 900;
        font-style: italic;
        letter-spacing: 1.5px;
      }
      .mc-circles {
        display: flex;
        align-items: center;
      }
      .mc-circle {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: inline-block;
      }
      .mc-circle.red { background: #eb001b; }
      .mc-circle.yellow { background: #f79e1b; margin-left: -11px; opacity: 0.9; }

      .rupay-text {
        font-size: 16px;
        font-weight: 800;
        background: rgba(255, 255, 255, 0.2);
        padding: 3px 8px;
        border-radius: 4px;
      }
      .amex-text {
        font-size: 14px;
        font-weight: 900;
        background: #006fcf;
        padding: 3px 8px;
        border-radius: 4px;
      }

      .card-number {
        font-family: 'Courier New', Courier, monospace;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 2.5px;
        margin-bottom: 16px;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        z-index: 2;
      }

      .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        z-index: 2;
      }
      .meta-label {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.8px;
        opacity: 0.75;
        margin-bottom: 2px;
      }
      .meta-value {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .expiry-pill {
        background: rgba(255, 255, 255, 0.22);
        padding: 3px 10px;
        border-radius: 12px;
        font-family: monospace;
        font-size: 12px;
      }
      .card-type-tag {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.5px;
        padding: 4px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
      }

      /* Card Actions Bar */
      .card-actions-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 2px;
        padding: 8px 2px 0;
        border-top: 1px solid var(--app-hairline);
      }
      .card-nickname {
        font-size: 13px;
        font-weight: 600;
        color: var(--app-ink);
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .card-nickname > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card-balance-tag {
        font-size: 12px;
        font-weight: 700;
        color: var(--app-positive, #10b981);
        background: var(--app-positive-soft, rgba(16, 185, 129, 0.1));
        padding: 2px 8px;
        border-radius: 999px;
      }
      .action-buttons {
        display: flex;
        gap: 4px;
        flex: 0 0 auto;
      }
      .action-btn {
        color: var(--app-ink-muted);
        &:hover {
          color: var(--app-ink);
        }
        &.delete:hover {
          color: var(--app-negative, #ef4444);
        }
      }
    `,
  ],
})
export class BankAccountsPage {
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly cards = this.bankAccountsService.bankAccounts;
  readonly isLoading = this.bankAccountsService.isLoading;

  totalBalance(): number {
    return this.cards().reduce((sum, card) => sum + Number(card.balance ?? 0), 0);
  }

  openAddDialog(): void {
    const isFirstCard = this.cards().length === 0;
    const currentBalance = this.transactionsService.balance();

    const ref = this.dialog.open(BankAccountDialogComponent, {
      width: '520px',
      data: { isFirstCard, currentBalance },
    });

    ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (result) => {
      if (result) {
        try {
          await this.bankAccountsService.create(result);
          this.snack.open(
            isFirstCard ? 'Primary card created & balance linked!' : 'Card added successfully!',
            undefined,
            { duration: 3000 }
          );
        } catch {
          this.snack.open('Failed to add card', 'Dismiss', { duration: 3000 });
        }
      }
    });
  }

  openEditDialog(card: BankAccount): void {
    const ref = this.dialog.open(BankAccountDialogComponent, {
      width: '520px',
      data: { account: card },
    });

    ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (result) => {
      if (result) {
        try {
          await this.bankAccountsService.update(card.id, result);
          this.snack.open('Card updated successfully!', undefined, { duration: 2500 });
        } catch {
          this.snack.open('Failed to update card', 'Dismiss', { duration: 3000 });
        }
      }
    });
  }

  async setPrimary(card: BankAccount): Promise<void> {
    try {
      await this.bankAccountsService.setPrimary(card.id);
      this.snack.open(`Set ${card.bank_name} as primary card`, undefined, { duration: 2500 });
    } catch {
      this.snack.open('Could not update primary status', 'Dismiss', { duration: 3000 });
    }
  }

  async confirmDelete(card: BankAccount): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: `Remove ${card.bank_name} Card?`,
      message: `Are you sure you want to remove this ${card.card_type} card (${card.card_number_masked})?`,
      confirmLabel: 'Remove Card',
      destructive: true,
      icon: 'trash-2',
    });

    if (ok) {
      try {
        await this.bankAccountsService.delete(card.id);
        this.snack.open('Card removed', undefined, { duration: 2500 });
      } catch {
        this.snack.open('Could not remove card', 'Dismiss', { duration: 3000 });
      }
    }
  }

  viewDetails(card: BankAccount): void {
    const dialogRef = this.dialog.open(BankAccountDetailsDialogComponent, {
      data: { card },
      maxWidth: '480px',
      width: '100%',
    });

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((res) => {
      if (res?.edit) {
        this.openEditDialog(card);
      }
    });
  }
}
