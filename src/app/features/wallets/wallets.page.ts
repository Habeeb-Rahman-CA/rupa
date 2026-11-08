import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { Wallet, WalletTransaction } from '../../core/models/domain.models';
import { WalletsService } from '../../core/services/wallets.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { errText } from '../../shared/utils/error-utils';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { CardsTabsComponent } from '../../shared/components/cards-tabs.component';
import { WalletDialogComponent, WalletDialogData } from './wallet-dialog.component';
import {
  WalletTransactionSheetComponent,
  WalletTransactionSheetData,
} from './wallet-transaction-sheet.component';

@Component({
  selector: 'app-wallets-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
    CardsTabsComponent,
  ],
  template: `
    <app-page-header title="Cards" subtitle="Manage your cards, accounts, and wallets">
      <button class="add-wallet-btn" type="button" (click)="openAddWallet()">
        <lucide-icon name="plus" />
        <span>Add wallet</span>
      </button>
    </app-page-header>

    <app-cards-tabs />

    @if (!isAvailable()) {
      <app-empty-state
        icon="wallet"
        title="Wallets need setup"
        message="Apply database migration 0011_wallets.sql, then reload the app."
      />
    } @else if (isLoading() && wallets().length === 0) {
      <app-loading-state label="Loading wallets…" />
    } @else if (wallets().length === 0) {
      <section class="intro-card app-card">
        <div class="intro-icon"><lucide-icon name="wallet" /></div>
        <div>
          <h2>Keep every wallet in one place</h2>
          <p>Track Amazon Pay, Paytm, metro cards, and other prepaid balances without mixing recharges with income.</p>
        </div>
      </section>
      <div class="empty-actions">
        <button mat-flat-button color="primary" (click)="openAddWallet()">
          <lucide-icon name="plus" /> Add your first wallet
        </button>
      </div>
    } @else {
      <section class="overview app-card">
        <div class="overview-icon"><lucide-icon name="wallet" /></div>
        <div>
          <span class="micro-label">Wallet balance</span>
          <strong>{{ totalBalance() | signedMoney }}</strong>
        </div>
        <span class="overview-count">{{ wallets().length }} wallet{{ wallets().length === 1 ? '' : 's' }}</span>
      </section>

      <div class="wallet-list">
        @for (wallet of wallets(); track wallet.id) {
          <section class="wallet-card app-card" [class.low-balance]="isLow(wallet)">
            <div class="wallet-face" [attr.data-theme]="wallet.theme">
              <header class="wallet-face-head">
                <div class="wallet-identity">
                  <div class="wallet-icon"><lucide-icon name="wallet" /></div>
                  <div class="wallet-copy">
                    <span class="wallet-eyebrow">Stored-value wallet</span>
                    <h2>{{ wallet.name }}</h2>
                  </div>
                </div>
                <button class="wallet-edit" mat-icon-button type="button" aria-label="Edit wallet" (click)="openEditWallet(wallet)">
                  <lucide-icon name="pencil" />
                </button>
              </header>

              <div class="wallet-face-balance">
                <span>Available balance</span>
                <strong>{{ wallet.balance | signedMoney }}</strong>
              </div>

              <div class="wallet-face-foot">
                <span class="wallet-status">
                  <i [class.alert-dot]="isLow(wallet)"></i>
                  {{ isLow(wallet) ? 'Low balance' : 'Ready to use' }}
                </span>
                @if (wallet.minimum_balance > 0) {
                  <span class="wallet-threshold">Alert at {{ wallet.minimum_balance | signedMoney }}</span>
                }
                <span class="wallet-entry-count">
                  {{ walletTransactions(wallet.id).length }} entr{{ walletTransactions(wallet.id).length === 1 ? 'y' : 'ies' }}
                </span>
              </div>
            </div>

            @if (isLow(wallet)) {
              <div class="low-alert" role="status">
                <lucide-icon name="alert-circle" />
                <span>Low balance — recharge this wallet soon.</span>
              </div>
            }

            <div class="wallet-actions" aria-label="Wallet actions">
              <button mat-stroked-button class="recharge-btn" type="button" (click)="openAddTransaction(wallet, 'recharge')">
                <lucide-icon name="arrow-down" /> Recharge
              </button>
              <button mat-stroked-button class="spend-btn" type="button" (click)="openAddTransaction(wallet, 'spend')">
                <lucide-icon name="arrow-up" /> Spending
              </button>
            </div>

            <div class="history-heading">
              <span>Recent activity</span>
              <span>{{ walletTransactions(wallet.id).length }}</span>
            </div>
            @if (walletTransactions(wallet.id).length > 0) {
              <ul class="history-list">
                @for (transaction of walletTransactions(wallet.id); track transaction.id) {
                  <li class="history-row">
                    <div class="history-icon" [class.spend]="transaction.kind === 'spend'">
                      <lucide-icon [name]="transaction.kind === 'recharge' ? 'arrow-down' : 'arrow-up'" />
                    </div>
                    <div class="history-main">
                      <strong>{{ transaction.kind === 'recharge' ? 'Recharge' : 'Wallet spending' }}</strong>
                      <span>






















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































                      {{ transaction.occurred_on | date: 'MMM d, y' }}
                        @if (transaction.kind === 'recharge' && transaction.funding_mode) { · {{ transaction.funding_mode === 'bank' ? 'Bank' : 'Cash' }} }
                        @if (transaction.notes) { · {{ transaction.notes }} }
                      </span>
                    </div>
                    <strong class="history-amount" [class.spend]="transaction.kind === 'spend'">
                      {{ transaction.amount | signedMoney: (transaction.kind === 'recharge' ? 'in' : 'out') }}
                    </strong>
                    <div class="history-actions">
                      <button mat-icon-button type="button" aria-label="Edit wallet transaction" (click)="openEditTransaction(wallet, transaction)">
                        <lucide-icon name="pencil" />
                      </button>
                      <button mat-icon-button type="button" aria-label="Delete wallet transaction" (click)="confirmDelete(transaction)">
                        <lucide-icon name="trash-2" />
                      </button>
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <div class="history-empty">No wallet activity yet.</div>
            }
          </section>
        }
      </div>
    }
  `,
  styles: [
    `
      .add-wallet-btn { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--app-ink-dark); color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
      .add-wallet-btn lucide-icon { width: 17px; height: 17px; }
      .intro-card { display: flex; align-items: center; gap: 14px; max-width: 620px; margin: 0 auto; }
      .intro-icon, .overview-icon { display: grid; place-items: center; flex: 0 0 auto; border-radius: 14px; background: var(--app-accent-soft); color: var(--app-accent); }
      .intro-icon { width: 48px; height: 48px; }
      .intro-icon lucide-icon { width: 22px; height: 22px; }
      .intro-card h2 { margin: 0; color: var(--app-ink); font-size: 16px; }
      .intro-card p { margin: 4px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.45; }
      .empty-actions { display: flex; justify-content: center; margin-top: 16px; }
      .empty-actions button { border-radius: 999px; }
      .empty-actions lucide-icon { width: 17px; height: 17px; margin-right: 5px; }
      .overview { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 14px 16px; }
      .overview-icon { width: 40px; height: 40px; }
      .overview-icon lucide-icon { width: 19px; height: 19px; }
      .overview strong { display: block; margin-top: 2px; color: var(--app-ink); font-size: 20px; font-variant-numeric: tabular-nums; }
      .overview-count { margin-left: auto; color: var(--app-ink-muted); font-size: 12px; }
      .wallet-list { display: flex; flex-direction: column; gap: 14px; }
      .wallet-card { padding: 12px; overflow: hidden; }
      .wallet-card.low-balance { box-shadow: 0 0 0 1px rgba(239, 68, 68, .25), var(--app-shadow-md); }
      .wallet-face {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 190px;
        overflow: hidden;
        padding: 18px;
        border-radius: var(--app-radius-lg);
        background: linear-gradient(145deg, #25282d 0%, var(--app-ink-dark) 62%, #050608 100%);
        color: #fff;
        box-shadow: 0 12px 24px rgba(15, 17, 20, .16);
      }
      .wallet-face[data-theme='blue'] { background: linear-gradient(145deg, #2563eb 0%, #1d4ed8 62%, #1e40af 100%); }
      .wallet-face[data-theme='purple'] { background: linear-gradient(145deg, #7c3aed 0%, #6d28d9 62%, #4c1d95 100%); }
      .wallet-face[data-theme='emerald'] { background: linear-gradient(145deg, #059669 0%, #047857 62%, #064e3b 100%); }
      .wallet-face[data-theme='sunset'] { background: linear-gradient(145deg, #f97316 0%, #ea580c 62%, #c2410c 100%); }
      .wallet-face[data-theme='gold'] { background: linear-gradient(145deg, #d97706 0%, #b45309 62%, #78350f 100%); }
      .wallet-face[data-theme='rose'] { background: linear-gradient(145deg, #e11d48 0%, #be123c 62%, #881337 100%); }
      .wallet-face::before {
        content: '';
        position: absolute;
        top: -58%;
        right: -22%;
        width: 78%;
        height: 145%;
        border: 1px solid rgba(255, 255, 255, .12);
        border-radius: 50%;
        box-shadow: 0 0 0 18px rgba(255, 255, 255, .025), 0 0 0 36px rgba(255, 255, 255, .018);
        pointer-events: none;
      }
      .wallet-face::after {
        content: '';
        position: absolute;
        right: -8%;
        bottom: 48px;
        left: -8%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .24), transparent);
        pointer-events: none;
      }
      .wallet-card.low-balance .wallet-face { box-shadow: inset 0 0 0 1px rgba(239, 68, 68, .48), 0 12px 24px rgba(15, 17, 20, .16); }
      .wallet-face-head,
      .wallet-face-foot,
      .wallet-identity { position: relative; z-index: 1; display: flex; align-items: center; }
      .wallet-face-head { justify-content: space-between; gap: 12px; }
      .wallet-identity { gap: 11px; min-width: 0; }
      .wallet-icon { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto; border: 1px solid rgba(255, 255, 255, .16); border-radius: 13px; background: rgba(255, 255, 255, .12); color: #fff; }
      .wallet-icon lucide-icon { width: 20px; height: 20px; }
      .wallet-copy { min-width: 0; }
      .wallet-eyebrow { display: block; margin-bottom: 3px; color: rgba(255, 255, 255, .58); font-size: 9px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
      .wallet-copy h2 { overflow: hidden; margin: 0; color: #fff; font-size: 16px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .wallet-edit { width: 34px; height: 34px; flex: 0 0 auto; color: rgba(255, 255, 255, .76); }
      .wallet-edit:hover { background: rgba(255, 255, 255, .12); color: #fff; }
      .wallet-edit lucide-icon { width: 18px; height: 18px; }
      .wallet-face-balance { position: relative; z-index: 1; margin: 22px 0 18px; }
      .wallet-face-balance span { display: block; color: rgba(255, 255, 255, .62); font-size: 11px; }
      .wallet-face-balance strong { display: block; margin-top: 3px; color: #fff; font-size: clamp(25px, 6vw, 31px); font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
      .wallet-face-foot { justify-content: space-between; gap: 12px; color: rgba(255, 255, 255, .68); font-size: 10px; font-weight: 600; }
      .wallet-status { display: inline-flex; align-items: center; gap: 6px; }
      .wallet-status i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--app-positive); box-shadow: 0 0 0 3px rgba(22, 163, 74, .16); }
      .wallet-status i.alert-dot { background: var(--app-negative); box-shadow: 0 0 0 3px rgba(239, 68, 68, .16); }
      .wallet-threshold { color: rgba(255, 255, 255, .48); font-size: 10px; }
      .wallet-entry-count { color: rgba(255, 255, 255, .48); }
      .low-alert { display: flex; align-items: center; gap: 7px; margin: 10px 2px 0; padding: 9px 11px; border-radius: 10px; background: var(--app-negative-soft); color: var(--app-negative); font-size: 12px; }
      .low-alert lucide-icon { width: 15px; height: 15px; }
      .wallet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 14px 2px 0; }
      .wallet-actions button { min-width: 0; min-height: 40px; border-radius: 999px !important; font-size: 12px; font-weight: 700; }
      .wallet-actions .recharge-btn { border-color: var(--app-positive) !important; background: var(--app-positive-soft) !important; color: var(--app-positive) !important; }
      .wallet-actions .spend-btn { border-color: var(--app-negative) !important; background: var(--app-negative-soft) !important; color: var(--app-negative) !important; }
      .wallet-actions lucide-icon { width: 16px; height: 16px; margin-right: 4px; }
      .history-heading { display: flex; justify-content: space-between; margin-top: 18px; padding-bottom: 8px; border-bottom: 1px solid var(--app-hairline); color: var(--app-ink-muted); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
      .history-list { list-style: none; margin: 0; padding: 0; }
      .history-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto; gap: 9px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--app-hairline); }
      .history-row:last-child { border-bottom: 0; }
      .history-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; background: var(--app-positive-soft); color: var(--app-positive); }
      .history-icon.spend { background: var(--app-negative-soft); color: var(--app-negative); }
      .history-icon lucide-icon { width: 15px; height: 15px; }
      .history-main { min-width: 0; }
      .history-main strong { display: block; overflow: hidden; color: var(--app-ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
      .history-main span { display: block; overflow: hidden; margin-top: 2px; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .history-amount { color: var(--app-positive); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .history-amount.spend { color: var(--app-negative); }
      .history-actions { display: flex; gap: 0; }
      .history-actions button { width: 32px; height: 32px; color: var(--app-ink-muted); }
      .history-actions lucide-icon { width: 16px; height: 16px; }
      .history-empty { padding: 14px 0 2px; color: var(--app-ink-muted); font-size: 13px; text-align: center; }
      @media (max-width: 480px) {
        .add-wallet-btn span { display: none; }
        .add-wallet-btn { width: 40px; justify-content: center; padding: 0; }
        .wallet-face-foot { gap: 8px; }
        .wallet-threshold { display: none; }
        .history-row { grid-template-columns: 30px minmax(0, 1fr) auto; }
        .history-actions { grid-column: 3; grid-row: 1; }
        .history-amount { grid-column: 2; grid-row: 2; justify-self: start; }
      }
    `,
  ],
})
export class WalletsPage {
  private readonly walletsService = inject(WalletsService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly wallets = this.walletsService.wallets;
  readonly isLoading = this.walletsService.isLoading;
  readonly isAvailable = this.walletsService.isAvailable;

  totalBalance(): number {
    return this.wallets().reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  }

  walletTransactions(walletId: string): WalletTransaction[] {
    return this.walletsService.transactionsFor(walletId);
  }

  isLow(wallet: Wallet): boolean {
    return wallet.minimum_balance > 0 && wallet.balance <= wallet.minimum_balance;
  }

  openAddWallet(): void {
    this.dialog.open(WalletDialogComponent, { width: '430px' });
  }

  openEditWallet(wallet: Wallet): void {
    this.dialog.open(WalletDialogComponent, {
      width: '430px',
      data: { wallet } satisfies WalletDialogData,
    });
  }

  openAddTransaction(wallet: Wallet, kind: 'recharge' | 'spend'): void {
    this.bottomSheet.open(WalletTransactionSheetComponent, {
      panelClass: 'quick-add-sheet',
      data: { wallet, kind } satisfies WalletTransactionSheetData,
    });
  }

  openEditTransaction(wallet: Wallet, transaction: WalletTransaction): void {
    this.bottomSheet.open(WalletTransactionSheetComponent, {
      panelClass: 'quick-add-sheet',
      data: { wallet, kind: transaction.kind, transaction } satisfies WalletTransactionSheetData,
    });
  }

  async confirmDelete(transaction: WalletTransaction): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete wallet entry?',
      message: 'The wallet and linked account balances will be recalculated atomically.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!ok) return;
    try {
      await this.walletsService.deleteTransaction(transaction);
      this.snack.open('Wallet entry deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errText(error, 'Could not delete the wallet entry.'), 'Dismiss', { duration: 4000 });
    }
  }
}
