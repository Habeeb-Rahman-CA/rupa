import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import {
  Subscription,
  SubscriptionStatus,
} from '../../core/models/domain.models';
import {
  daysBetween,
  SubscriptionsService,
} from '../../core/services/subscriptions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { errorText } from '../../shared/utils/error-utils';
import { SubscriptionDialogComponent } from './subscription-dialog.component';
import {
  RecordSubscriptionPaymentDialogComponent,
} from './record-subscription-payment-dialog.component';

type SubscriptionFilter = 'active' | 'all' | 'paused' | 'history';

@Component({
  selector: 'app-subscriptions-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header
      title="Subscriptions"
      subtitle="Plan renewals, payments, and recurring costs"
    >
      <button class="add-btn" type="button" (click)="openAdd()" aria-label="Add subscription">
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (isLoading() && subscriptions().length === 0) {
      <app-loading-state label="Loading subscriptions…" />
    } @else if (subscriptions().length === 0) {
      <app-empty-state
        icon="repeat"
        title="No subscriptions yet"
        message="Add a recurring service to see renewals, reminders, and spending totals in one place."
      />
      <div class="empty-action">
        <button mat-flat-button color="primary" (click)="openAdd()">
          <lucide-icon name="plus" /> Add Subscription
        </button>
      </div>
    } @else {
      <section class="stats-grid">
        <article class="stat-card app-card">
          <span class="stat-icon"><lucide-icon name="repeat" /></span>
          <span class="micro-label">Active subscriptions</span>
          <strong>{{ activeCount() }}</strong>
        </article>
        <article class="stat-card app-card">
          <span class="stat-icon"><lucide-icon name="calendar" /></span>
          <span class="micro-label">Monthly recurring</span>
          <strong>{{ monthlySpending() | signedMoney }}</strong>
        </article>
        <article class="stat-card app-card">
          <span class="stat-icon"><lucide-icon name="trending-up" /></span>
          <span class="micro-label">Yearly recurring</span>
          <strong>{{ yearlySpending() | signedMoney }}</strong>
        </article>
        <article class="stat-card app-card">
          <span class="stat-icon"><lucide-icon name="wallet" /></span>
          <span class="micro-label">Recurring cost / month</span>
          <strong>{{ totalRecurringCosts() | signedMoney }}</strong>
        </article>
      </section>

      @if (renewalReminders().length > 0) {
        <section class="reminder-card app-card" aria-label="Renewal reminders">
          <div class="section-heading">
            <div>
              <span class="micro-label">Renewal reminders</span>
              <h2>Upcoming charges need attention</h2>
            </div>
            <lucide-icon name="alert-circle" />
          </div>
          <div class="reminder-list">
            @for (reminder of renewalReminders(); track reminder.subscription.id) {
              <div class="reminder-row">
                <div>
                  <strong>{{ reminder.subscription.name }}</strong>
                  <span>{{ reminder.subscription.next_renewal_date | date: 'MMM d, y' : 'UTC' }}</span>
                </div>
                <span class="reminder-pill">{{ reminder.daysUntilRenewal }} day{{ reminder.daysUntilRenewal === 1 ? '' : 's' }}</span>
              </div>
            }
          </div>
          <p class="section-note">Reminders never create expenses automatically. Record a payment only when it actually happens.</p>
        </section>
      }

      <div class="planning-grid">
        <section class="planning-card app-card">
          <div class="section-heading">
            <div><span class="micro-label">Next 30 days</span><h2>Upcoming renewals</h2></div>
            <lucide-icon name="calendar" />
          </div>
          @if (upcomingRenewals().length === 0) {
            <p class="muted-copy">No active renewals in the next 30 days.</p>
          } @else {
            @for (subscription of upcomingRenewals(); track subscription.id) {
              <div class="compact-row">
                <div class="compact-copy"><strong>{{ subscription.name }}</strong><span>{{ subscription.next_renewal_date | date: 'EEE, MMM d' : 'UTC' }}</span></div>
                <div class="compact-right"><strong>{{ subscription.amount | signedMoney }}</strong><span>{{ daysLabel(subscription.next_renewal_date, 'renewal') }}</span></div>
              </div>
            }
          }
        </section>

        <section class="planning-card app-card">
          <div class="section-heading">
            <div><span class="micro-label">Next 30 days</span><h2>Expiring soon</h2></div>
            <lucide-icon name="calendar" />
          </div>
          @if (expiringSoon().length === 0) {
            <p class="muted-copy">No subscription expiry dates approaching.</p>
          } @else {
            @for (subscription of expiringSoon(); track subscription.id) {
              <div class="compact-row">
                <div class="compact-copy"><strong>{{ subscription.name }}</strong><span>Expires {{ subscription.end_date | date: 'EEE, MMM d' : 'UTC' }}</span></div>
                <div class="compact-right"><span class="expiry-text">{{ daysLabel(subscription.end_date!, 'expiry') }}</span></div>
              </div>
            }
          }
        </section>
      </div>

      <div class="filter-bar">
        <mat-button-toggle-group
          [value]="filter()"
          (change)="filter.set($event.value)"
          hideSingleSelectionIndicator
          class="filter-toggle"
        >
          <mat-button-toggle value="active">Active</mat-button-toggle>
          <mat-button-toggle value="all">All</mat-button-toggle>
          <mat-button-toggle value="paused">Paused</mat-button-toggle>
          <mat-button-toggle value="history">History</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (visibleSubscriptions().length === 0) {
        <div class="small-empty app-card">No subscriptions in this view.</div>
      } @else {
        <section class="subscription-list">
          @for (subscription of visibleSubscriptions(); track subscription.id) {
            <article class="subscription-card app-card" [class.is-history]="isHistory(subscription)">
              <div class="subscription-top">
                <div class="subscription-copy">
                  <div class="title-row">
                    <h2>{{ subscription.name }}</h2>
                    <span class="status-pill" [attr.data-status]="statusFor(subscription)">{{ statusLabel(statusFor(subscription)) }}</span>
                  </div>
                  <p>{{ subscription.category }} · {{ cycleLabel(subscription.billing_cycle) }}</p>
                </div>
                <div class="subscription-amount">
                  <strong>{{ subscription.amount | signedMoney }}</strong>
                  <span>{{ cycleLabel(subscription.billing_cycle, true) }}</span>
                </div>
              </div>

              <div class="details-grid">
                <div><span class="micro-label">Next renewal</span><strong>{{ subscription.next_renewal_date | date: 'MMM d, y' : 'UTC' }}</strong></div>
                <div><span class="micro-label">Expiry date</span><strong>{{ subscription.end_date ? (subscription.end_date | date: 'MMM d, y' : 'UTC') : 'No expiry' }}</strong></div>
                <div><span class="micro-label">Payment account</span><strong>{{ accountName(subscription.payment_account_id) }}</strong></div>
                <div><span class="micro-label">Auto-renewal</span><strong>{{ subscription.auto_renewal ? 'Expected' : 'Off' }}</strong></div>
                @if (statusFor(subscription) === 'cancelled' && subscription.cancelled_on) {
                  <div><span class="micro-label">Cancelled on</span><strong>{{ subscription.cancelled_on | date: 'MMM d, y' : 'UTC' }}</strong></div>
                }
              </div>

              @if (subscription.notes) {
                <p class="subscription-notes"><lucide-icon name="sticky-note" /> {{ subscription.notes }}</p>
              }

              <div class="subscription-actions">
                @if (statusFor(subscription) === 'active' || statusFor(subscription) === 'paused') {
                  <button mat-stroked-button class="payment-action" (click)="recordPayment(subscription)">
                    Record payment
                  </button>
                }
                <button mat-icon-button type="button" aria-label="Edit subscription" title="Edit subscription" (click)="openEdit(subscription)">
                  <lucide-icon name="pencil" />
                </button>
                @if (statusFor(subscription) === 'active' || statusFor(subscription) === 'paused') {
                  <button mat-icon-button type="button" [attr.aria-label]="statusFor(subscription) === 'active' ? 'Pause subscription' : 'Resume subscription'" [title]="statusFor(subscription) === 'active' ? 'Pause subscription' : 'Resume subscription'" (click)="togglePaused(subscription)">
                    <lucide-icon name="refresh-cw" />
                  </button>
                  <button mat-icon-button type="button" class="danger-button" aria-label="Cancel subscription" title="Cancel subscription" (click)="cancel(subscription)">
                    <lucide-icon name="x" />
                  </button>
                }
                <button mat-icon-button type="button" class="danger-button" aria-label="Delete subscription" title="Delete subscription" (click)="confirmDelete(subscription)">
                  <lucide-icon name="trash-2" />
                </button>
              </div>
            </article>
          }
        </section>
      }

      @if (payments().length > 0) {
        <section class="history-section">
          <div class="section-heading page-section-heading">
            <div><span class="micro-label">Actual payments</span><h2>Payment &amp; renewal history</h2></div>
            <lucide-icon name="receipt" />
          </div>
          <div class="history-list app-card">
            @for (payment of payments(); track payment.id) {
              <div class="history-row">
                <div class="history-copy">
                  <strong>{{ subscriptionName(payment.subscription_id) }}</strong>
                  <span>Paid {{ payment.paid_on | date: 'MMM d, y' : 'UTC' }} · Renewal due {{ renewalDue(payment.renewal_id) | date: 'MMM d, y' : 'UTC' }}</span>
                </div>
                <div class="history-amount"><strong>{{ payment.amount | signedMoney }}</strong><span>{{ payment.transaction_id ? 'Linked expense' : 'Unlinked' }}</span></div>
              </div>
            }
          </div>
        </section>
      }

      @if (priceChanges().length > 0) {
        <section class="history-section">
          <div class="section-heading page-section-heading">
            <div><span class="micro-label">Price tracking</span><h2>Price changes</h2></div>
            <lucide-icon name="trending-up" />
          </div>
          <div class="history-list app-card">
            @for (change of priceChanges(); track change.id) {
              <div class="history-row">
                <div class="history-copy"><strong>{{ subscriptionName(change.subscription_id) }}</strong><span>Effective {{ change.effective_on | date: 'MMM d, y' : 'UTC' }}</span></div>
                <div class="history-amount"><strong>{{ change.old_amount | signedMoney }} → {{ change.new_amount | signedMoney }}</strong><span>Price updated</span></div>
              </div>
            }
          </div>
        </section>
      }
    }
  `,
  styles: [
    `
      .empty-action { display: flex; justify-content: center; margin-top: 16px; }
      .empty-action button { border-radius: 999px; font-weight: 700; }
      .empty-action lucide-icon { width: 17px; height: 17px; margin-right: 4px; }
      .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
      .stat-card { display: flex; flex-direction: column; gap: 5px; padding: 14px; min-width: 0; }
      .stat-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: var(--app-accent); background: var(--app-accent-soft); }
      .stat-icon lucide-icon { width: 16px; height: 16px; }
      .stat-card strong { font-size: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .reminder-card { margin-bottom: 14px; border-left: 3px solid var(--app-negative); padding: 14px 16px; }
      .section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .section-heading h2 { margin: 3px 0 0; font-size: 15px; font-weight: 700; }
      .section-heading > lucide-icon { width: 19px; height: 19px; color: var(--app-ink-muted); }
      .reminder-card .section-heading > lucide-icon { color: var(--app-negative); }
      .reminder-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      .reminder-row, .compact-row, .history-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .reminder-row > div, .compact-copy, .history-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .reminder-row strong, .compact-copy strong, .history-copy strong { font-size: 13px; }
      .reminder-row span, .compact-copy span, .history-copy span { color: var(--app-ink-muted); font-size: 11px; }
      .reminder-pill { padding: 4px 9px; border-radius: 999px; color: var(--app-negative); background: var(--app-negative-soft); font-size: 11px !important; font-weight: 700; white-space: nowrap; }
      .section-note { margin: 12px 0 0; color: var(--app-ink-muted); font-size: 11px; line-height: 1.35; }
      .planning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .planning-card { padding: 14px 16px; }
      .planning-card .section-heading { margin-bottom: 12px; }
      .muted-copy { margin: 0; color: var(--app-ink-muted); font-size: 12px; }
      .compact-row { padding: 9px 0; border-top: 1px solid var(--app-hairline); }
      .compact-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
      .compact-right strong { font-size: 13px; font-variant-numeric: tabular-nums; }
      .compact-right span { color: var(--app-ink-muted); font-size: 11px; }
      .expiry-text { color: var(--app-negative) !important; font-weight: 700; }
      .filter-bar { display: flex; overflow-x: auto; margin-bottom: 14px; padding: 2px 0 4px; scrollbar-width: none; }
      .filter-bar::-webkit-scrollbar { display: none; }
      .filter-toggle { display: inline-flex; width: 100%; min-width: max-content; padding: 3px !important; border: 1px solid var(--app-hairline) !important; border-radius: 999px !important; background: var(--app-canvas) !important; }
      .filter-toggle mat-button-toggle { flex: 1 0 auto; border: 0 !important; border-radius: 999px !important; }
      ::ng-deep .filter-toggle .mat-button-toggle-label-content { padding: 0 17px !important; line-height: 34px !important; font-size: 12px !important; }
      .small-empty { color: var(--app-ink-muted); font-size: 13px; text-align: center; }
      .subscription-list { display: flex; flex-direction: column; gap: 10px; }
      .subscription-card { padding: 16px; }
      .subscription-card.is-history { opacity: .92; }
      .subscription-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
      .subscription-copy { min-width: 0; }
      .title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .title-row h2 { margin: 0; font-size: 15px; font-weight: 700; }
      .subscription-copy p { margin: 4px 0 0; color: var(--app-ink-muted); font-size: 12px; }
      .status-pill { padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
      .status-pill[data-status='active'] { color: var(--app-positive); background: var(--app-positive-soft); }
      .status-pill[data-status='paused'] { color: #a16207; background: #fef3c7; }
      .status-pill[data-status='cancelled'], .status-pill[data-status='expired'] { color: var(--app-ink-muted); background: var(--app-input-bg); }
      .subscription-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; }
      .subscription-amount strong { font-size: 17px; font-variant-numeric: tabular-nums; }
      .subscription-amount span { color: var(--app-ink-muted); font-size: 11px; }
      .details-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 15px; padding-top: 12px; border-top: 1px solid var(--app-hairline); }
      .details-grid div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .details-grid strong { overflow: hidden; color: var(--app-ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .subscription-notes { display: flex; align-items: flex-start; gap: 6px; margin: 12px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .subscription-notes lucide-icon { width: 14px; height: 14px; flex: 0 0 auto; }
      .subscription-actions { display: flex; justify-content: flex-end; align-items: center; gap: 2px; margin-top: 12px; }
      .subscription-actions button { border-radius: 999px; }
      .payment-action { margin-right: auto; font-size: 12px; font-weight: 700; }
      .payment-action lucide-icon { width: 16px; height: 16px; margin-right: 4px; }
      .danger-button { color: var(--app-negative) !important; }
      .history-section { margin-top: 24px; }
      .page-section-heading { margin-bottom: 10px; padding: 0 4px; }
      .history-list { display: flex; flex-direction: column; gap: 0; padding: 4px 14px; }
      .history-row { padding: 11px 0; border-bottom: 1px solid var(--app-hairline); }
      .history-row:last-child { border-bottom: 0; }
      .history-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
      .history-amount strong { font-size: 13px; font-variant-numeric: tabular-nums; }
      .history-amount span { color: var(--app-ink-muted); font-size: 10px; }
      @media (max-width: 760px) { .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .details-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .planning-grid { grid-template-columns: 1fr; } .subscription-top { gap: 8px; } .subscription-amount strong { font-size: 15px; } }
    `,
  ],
})
export class SubscriptionsPage {
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly subscriptions = this.subscriptionsService.subscriptions;
  readonly payments = this.subscriptionsService.payments;
  readonly priceChanges = this.subscriptionsService.priceChanges;
  readonly isLoading = this.subscriptionsService.isLoading;
  readonly activeCount = this.subscriptionsService.activeCount;
  readonly monthlySpending = this.subscriptionsService.monthlySpending;
  readonly yearlySpending = this.subscriptionsService.yearlySpending;
  readonly totalRecurringCosts = this.subscriptionsService.totalRecurringCosts;
  readonly upcomingRenewals = this.subscriptionsService.upcomingRenewals;
  readonly expiringSoon = this.subscriptionsService.expiringSoon;
  readonly renewalReminders = this.subscriptionsService.renewalReminders;
  readonly filter = signal<SubscriptionFilter>('active');

  readonly visibleSubscriptions = computed(() => {
    const selected = this.filter();
    return this.subscriptions().filter((subscription) => {
      const status = this.statusFor(subscription);
      if (selected === 'history') return status === 'cancelled' || status === 'expired';
      if (selected === 'paused') return status === 'paused';
      if (selected === 'active') return status === 'active';
      return true;
    });
  });

  openAdd(): void {
    this.dialog.open(SubscriptionDialogComponent, { width: 'min(620px, calc(100vw - 24px))' });
  }

  openEdit(subscription: Subscription): void {
    this.dialog.open(SubscriptionDialogComponent, {
      data: { subscription: { ...subscription, status: this.statusFor(subscription) } },
      width: 'min(620px, calc(100vw - 24px))',
    });
  }

  recordPayment(subscription: Subscription): void {
    this.dialog.open(RecordSubscriptionPaymentDialogComponent, {
      data: { subscription },
      width: 'min(520px, calc(100vw - 24px))',
    });
  }

  async togglePaused(subscription: Subscription): Promise<void> {
    const next: SubscriptionStatus = this.statusFor(subscription) === 'paused' ? 'active' : 'paused';
    try {
      await this.subscriptionsService.update(subscription.id, { status: next });
      this.snack.open(next === 'paused' ? 'Subscription paused.' : 'Subscription resumed.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t update subscription.'), 'Dismiss', { duration: 4000 });
    }
  }

  async cancel(subscription: Subscription): Promise<void> {
    const confirmed = await openConfirm(this.dialog, {
      title: `Cancel ${subscription.name}?`,
      message: 'The subscription will remain in history and will not be removed.',
      confirmLabel: 'Cancel subscription',
      destructive: true,
      icon: 'x',
    });
    if (!confirmed) return;
    try {
      await this.subscriptionsService.update(subscription.id, { status: 'cancelled' });
      this.snack.open('Subscription cancelled and kept in history.', undefined, { duration: 2500 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t cancel subscription.'), 'Dismiss', { duration: 4000 });
    }
  }

  async confirmDelete(subscription: Subscription): Promise<void> {
    const confirmed = await openConfirm(this.dialog, {
      title: `Delete ${subscription.name}?`,
      message: 'This permanently removes the subscription record and its payment history. Its expense transactions stay in your ledger.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (!confirmed) return;
    try {
      await this.subscriptionsService.delete(subscription.id);
      this.snack.open('Subscription deleted.', undefined, { duration: 2000 });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t delete subscription.'), 'Dismiss', { duration: 4000 });
    }
  }

  statusFor(subscription: Subscription): SubscriptionStatus {
    return this.subscriptionsService.statusFor(subscription);
  }

  statusLabel(status: SubscriptionStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  isHistory(subscription: Subscription): boolean {
    const status = this.statusFor(subscription);
    return status === 'cancelled' || status === 'expired';
  }

  cycleLabel(cycle: Subscription['billing_cycle'], short = false): string {
    if (short) return cycle === 'yearly' ? '/ year' : cycle === 'quarterly' ? '/ quarter' : cycle === 'monthly' ? '/ month' : '/ week';
    return cycle.charAt(0).toUpperCase() + cycle.slice(1);
  }

  accountName(id: string | null): string {
    if (!id) return 'Not specified';
    const account = this.bankAccountsService.bankAccounts().find((item) => item.id === id);
    return account ? `${account.bank_name} · ${account.account_name}` : 'Account unavailable';
  }

  subscriptionName(id: string): string {
    return this.subscriptions().find((subscription) => subscription.id === id)?.name ?? 'Deleted subscription';
  }

  renewalDue(id: string): string | null {
    return this.subscriptionsService.renewals().find((renewal) => renewal.id === id)?.due_on ?? null;
  }

  daysLabel(date: string, noun: string): string {
    const days = daysBetween(todayIso(), date);
    if (days === 0) return `Due today`;
    if (days === 1) return `In 1 day`;
    return days > 0 ? `In ${days} days` : `${noun} passed`;
  }

}

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
