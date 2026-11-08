import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';

import {
  Subscription,
  SubscriptionStatus,
  SubscriptionTheme,
} from '../../core/models/domain.models';
import {
  daysBetween,
  resolveSubscriptionTheme,
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

@Component({
  selector: 'app-subscriptions-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatTooltipModule,
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
                  <span>{{ reminder.subscription.next_renewal_date | date: 'MMM d, y' }}</span>
                </div>
                <span class="reminder-pill">{{ reminder.daysUntilRenewal }} day{{ reminder.daysUntilRenewal === 1 ? '' : 's' }}</span>
              </div>
            }
          </div>
          <p class="section-note">Reminders never create expenses automatically. Record a payment only when it actually happens.</p>
        </section>
      }

      <section class="subscriptions-grid">
          @for (subscription of sortedSubscriptions(); track subscription.id) {
            <article
              class="sub-card-wrapper"
              [class.is-history]="isHistory(subscription)"
            >
              <!-- Digital Subscription Pass Card Face -->
              <div class="sub-pass-face" [attr.data-theme]="getTheme(subscription)">
                <div class="pass-ambient-glow"></div>

                <!-- Pass Top Header: Compact Emblem + Titles + Status Dot -->
                <div class="pass-top">
                  <div class="pass-identity">
                    <div class="pass-emblem">
                      <lucide-icon [name]="getIconName(subscription)" />
                    </div>
                    <div class="pass-titles">
                      <span class="pass-eyebrow">{{ getEyebrow(subscription) }}</span>
                      <h2 class="pass-name" [title]="subscription.name">{{ subscription.name }}</h2>
                    </div>
                  </div>

                  <span class="pass-status-pill" [attr.data-status]="statusFor(subscription)">
                    <i class="status-dot"></i>
                    {{ statusLabel(statusFor(subscription)) }}
                  </span>
                </div>

                <!-- Pricing & Next Renewal Info -->
                <div class="pass-middle">
                  <div class="pass-amount-wrap">
                    <strong class="pass-amount">{{ subscription.amount | signedMoney }}</strong>
                    <span class="pass-cadence">{{ cycleLabel(subscription.billing_cycle, true) }}</span>
                  </div>

                  <div class="pass-renewal-chip" [class.urgent]="isDueSoon(subscription)">
                    <span class="chip-date">{{ subscription.next_renewal_date | date: 'MMM d' }}</span>
                    <span class="chip-sep">·</span>
                    <span class="chip-days">{{ daysLabel(subscription.next_renewal_date, 'Renewal') }}</span>
                  </div>
                </div>

                <!-- Slim Progress Bar -->
                <div
                  class="cycle-progress-track"
                  [matTooltip]="getCycleProgress(subscription) + '% through billing cycle'"
                >
                  <div class="cycle-progress-fill" [style.width.%]="getCycleProgress(subscription)"></div>
                </div>

                <!-- Compact Meta Row -->
                <div class="pass-meta-compact">
                  <span class="meta-item" [title]="accountName(subscription.payment_account_id)">
                    <lucide-icon name="credit-card" />
                    {{ accountName(subscription.payment_account_id) }}
                  </span>
                </div>

                @if (subscription.notes) {
                  <p class="pass-notes" [title]="subscription.notes">
                    <lucide-icon name="sticky-note" />
                    <span>{{ subscription.notes }}</span>
                  </p>
                }

                <!-- Card Actions: Renew (no icon) + Edit + Delete -->
                <div class="pass-actions">
                  @if (statusFor(subscription) === 'active' || statusFor(subscription) === 'paused') {
                    <button
                      mat-stroked-button
                      type="button"
                      class="pass-pay-btn"
                      (click)="renew(subscription)"
                    >
                      Renew
                    </button>
                  }

                  <div class="pass-action-icons">
                    <button
                      mat-icon-button
                      type="button"
                      (click)="openEdit(subscription)"
                      matTooltip="Edit subscription"
                      aria-label="Edit subscription"
                    >
                      <lucide-icon name="pencil" />
                    </button>

                    <button
                      mat-icon-button
                      type="button"
                      class="danger-button"
                      (click)="confirmDelete(subscription)"
                      matTooltip="Delete subscription"
                      aria-label="Delete subscription"
                    >
                      <lucide-icon name="trash-2" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          }
        </section>

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
                  <span>Paid {{ payment.paid_on | date: 'MMM d, y' }} · Renewal due {{ renewalDue(payment.renewal_id) | date: 'MMM d, y' }}</span>
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
                <div class="history-copy"><strong>{{ subscriptionName(change.subscription_id) }}</strong><span>Effective {{ change.effective_on | date: 'MMM d, y' }}</span></div>
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
      .reminder-card { margin-bottom: 14px; border-left: 3px solid var(--app-negative); padding: 14px 16px; }
      .section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .section-heading h2 { margin: 3px 0 0; font-size: 15px; font-weight: 700; }
      .section-heading > lucide-icon { width: 19px; height: 19px; color: var(--app-ink-muted); }
      .reminder-card .section-heading > lucide-icon { color: var(--app-negative); }
      .reminder-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      .reminder-row, .history-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .reminder-row > div, .history-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .reminder-row strong, .history-copy strong { font-size: 13px; }
      .reminder-row span, .history-copy span { color: var(--app-ink-muted); font-size: 11px; }
      .reminder-pill { padding: 4px 9px; border-radius: 999px; color: var(--app-negative); background: var(--app-negative-soft); font-size: 11px !important; font-weight: 700; white-space: nowrap; }
      .section-note { margin: 12px 0 0; color: var(--app-ink-muted); font-size: 11px; line-height: 1.35; }
      
      /* Subscriptions Grid & Pass Card Styles */
      .subscriptions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .sub-card-wrapper {
        display: flex;
        flex-direction: column;
        border-radius: 22px;
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }
      .sub-card-wrapper:hover {
        transform: translateY(-4px);
      }
      .sub-card-wrapper.is-history {
        opacity: 0.85;
      }
      .sub-card-wrapper.is-paused .pass-name {
        opacity: 0.9;
      }

      /* Pass Face - Compact, Minimalist & Modern */
      .sub-pass-face {
        position: relative;
        border-radius: 16px;
        padding: 13px 15px 11px;
        color: #ffffff;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 8px 22px -6px rgba(0, 0, 0, 0.32);
        border: 1px solid rgba(255, 255, 255, 0.12);
        transition: border-color 0.25s ease;
      }
      .pass-ambient-glow {
        position: absolute;
        top: -40px;
        right: -40px;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--theme-glow, rgba(255, 255, 255, 0.22)) 0%, transparent 70%);
        pointer-events: none;
      }

      /* Pass Top Header */
      .pass-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .pass-identity {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .pass-emblem {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #ffffff;
        flex: 0 0 auto;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.16);
      }
      .pass-emblem lucide-icon {
        width: 16px;
        height: 16px;
      }
      .pass-titles {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .pass-eyebrow {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--theme-accent, #ffffff);
        opacity: 0.9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pass-name {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pass-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        white-space: nowrap;
      }
      .status-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        display: inline-block;
      }
      .pass-status-pill[data-status='active'] .status-dot {
        background: #34d399;
        box-shadow: 0 0 6px #34d399;
      }
      .pass-status-pill[data-status='paused'] .status-dot {
        background: #fbbf24;
      }
      .pass-status-pill[data-status='cancelled'] .status-dot,
      .pass-status-pill[data-status='expired'] .status-dot {
        background: #94a3b8;
      }

      /* Pricing & Renewal Line */
      .pass-middle {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 6px;
        margin-bottom: 6px;
      }
      .pass-amount-wrap {
        display: flex;
        align-items: baseline;
        gap: 3px;
      }
      .pass-amount {
        font-size: 21px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }
      .pass-cadence {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.8;
        text-transform: capitalize;
      }
      .pass-renewal-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.1);
        white-space: nowrap;
      }
      .pass-renewal-chip.urgent {
        background: rgba(239, 68, 68, 0.3);
        color: #fecaca;
        border: 1px solid rgba(239, 68, 68, 0.5);
      }
      .chip-sep {
        opacity: 0.5;
      }
      .chip-days {
        font-weight: 700;
      }

      /* Cycle Progress Bar */
      .cycle-progress-track {
        height: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        overflow: hidden;
        margin-bottom: 7px;
      }
      .cycle-progress-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--theme-accent, #38bdf8);
        box-shadow: 0 0 6px var(--theme-accent, #38bdf8);
        transition: width 0.4s ease;
      }

      /* Compact Meta Row */
      .pass-meta-compact {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 10px;
        opacity: 0.82;
      }
      .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 160px;
      }
      .meta-item lucide-icon {
        width: 11px;
        height: 11px;
        flex-shrink: 0;
      }

      .pass-notes {
        display: flex;
        align-items: flex-start;
        gap: 5px;
        margin: 6px 0 0;
        padding: 4px 8px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.22);
        font-size: 10px;
        opacity: 0.85;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pass-notes lucide-icon {
        width: 11px;
        height: 11px;
        flex: 0 0 auto;
        margin-top: 1px;
      }

      /* Pass Actions */
      .pass-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.09);
      }
      .pass-pay-btn {
        border-radius: 999px !important;
        padding: 0 16px !important;
        height: 38px !important;
        min-height: 38px !important;
        line-height: 38px !important;
        border-color: rgba(255, 255, 255, 0.24) !important;
        color: #ffffff !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        background: rgba(255, 255, 255, 0.09) !important;
        backdrop-filter: blur(4px) !important;
      }
      .pass-pay-btn:hover {
        background: rgba(255, 255, 255, 0.18) !important;
        border-color: rgba(255, 255, 255, 0.42) !important;
      }
      .pass-action-icons {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      .pass-action-icons button {
        color: rgba(255, 255, 255, 0.85) !important;
        border-radius: 999px !important;
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        min-height: 38px !important;
        padding: 0 !important;
        display: grid !important;
        place-items: center !important;
        background: rgba(255, 255, 255, 0.06) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      .pass-action-icons button lucide-icon {
        width: 16px;
        height: 16px;
      }
      .pass-action-icons button:hover {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.18) !important;
        border-color: rgba(255, 255, 255, 0.28) !important;
      }
      .danger-button:hover {
        color: #fca5a5 !important;
        background: rgba(239, 68, 68, 0.25) !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
      }

      /* 7 Color Themes */
      .sub-pass-face[data-theme='mint'] {
        background: radial-gradient(circle at 85% 15%, rgba(16, 163, 127, 0.35) 0%, transparent 60%),
                    linear-gradient(145deg, #0b1c18 0%, #0d1413 55%, #050a09 100%);
        border-color: rgba(16, 163, 127, 0.35);
        --theme-accent: #10a37f;
        --theme-glow: rgba(16, 163, 127, 0.45);
      }
      .sub-pass-face[data-theme='neon'] {
        background: radial-gradient(circle at 85% 15%, rgba(29, 185, 84, 0.35) 0%, transparent 60%),
                    linear-gradient(145deg, #0a1c10 0%, #121212 55%, #050505 100%);
        border-color: rgba(29, 185, 84, 0.35);
        --theme-accent: #1ed760;
        --theme-glow: rgba(29, 185, 84, 0.45);
      }
      .sub-pass-face[data-theme='rose'] {
        background: radial-gradient(circle at 85% 15%, rgba(252, 60, 68, 0.4) 0%, transparent 60%),
                    radial-gradient(circle at 15% 85%, rgba(212, 0, 89, 0.25) 0%, transparent 55%),
                    linear-gradient(145deg, #380816 0%, #1f050d 55%, #0e0206 100%);
        border-color: rgba(252, 60, 68, 0.4);
        --theme-accent: #fc3c44;
        --theme-glow: rgba(252, 60, 68, 0.5);
      }
      .sub-pass-face[data-theme='amber'] {
        background: radial-gradient(circle at 85% 15%, rgba(255, 87, 34, 0.38) 0%, transparent 60%),
                    linear-gradient(145deg, #2b1306 0%, #190e06 55%, #0d0702 100%);
        border-color: rgba(255, 107, 53, 0.38);
        --theme-accent: #ff6b35;
        --theme-glow: rgba(255, 107, 53, 0.45);
      }
      .sub-pass-face[data-theme='scarlet'] {
        background: radial-gradient(circle at 85% 15%, rgba(229, 9, 20, 0.38) 0%, transparent 60%),
                    linear-gradient(145deg, #2a080c 0%, #141414 55%, #080808 100%);
        border-color: rgba(229, 9, 20, 0.35);
        --theme-accent: #e50914;
        --theme-glow: rgba(229, 9, 20, 0.45);
      }
      .sub-pass-face[data-theme='slate'] {
        background: radial-gradient(circle at 85% 15%, rgba(148, 163, 184, 0.25) 0%, transparent 60%),
                    linear-gradient(145deg, #1e293b 0%, #0f172a 60%, #030712 100%);
        border-color: rgba(148, 163, 184, 0.28);
        --theme-accent: #94a3b8;
        --theme-glow: rgba(148, 163, 184, 0.35);
      }
      .sub-pass-face[data-theme='violet'] {
        background: radial-gradient(circle at 85% 15%, rgba(99, 102, 241, 0.36) 0%, transparent 60%),
                    linear-gradient(145deg, #1e1b4b 0%, #0f172a 55%, #030712 100%);
        border-color: rgba(99, 102, 241, 0.35);
        --theme-accent: #818cf8;
        --theme-glow: rgba(99, 102, 241, 0.45);
      }

      .history-section { margin-top: 24px; }
      .page-section-heading { margin-bottom: 10px; padding: 0 4px; }
      .history-list { display: flex; flex-direction: column; gap: 0; padding: 4px 14px; }
      .history-row { padding: 11px 0; border-bottom: 1px solid var(--app-hairline); }
      .history-row:last-child { border-bottom: 0; }
      .history-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
      .history-amount strong { font-size: 13px; font-variant-numeric: tabular-nums; }
      .history-amount span { color: var(--app-ink-muted); font-size: 10px; }
      @media (max-width: 560px) { .subscriptions-grid { grid-template-columns: 1fr; } }
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
  readonly renewalReminders = this.subscriptionsService.renewalReminders;

  /** Cards ordered by lifecycle: active → paused → expired → cancelled, soonest renewal first within each group. */
  readonly sortedSubscriptions = computed(() => {
    const rank: Record<SubscriptionStatus, number> = {
      active: 0,
      paused: 1,
      expired: 2,
      cancelled: 3,
    };
    return [...this.subscriptions()].sort((a, b) => {
      const byStatus = rank[this.statusFor(a)] - rank[this.statusFor(b)];
      return byStatus !== 0 ? byStatus : a.next_renewal_date.localeCompare(b.next_renewal_date);
    });
  });

  getTheme(subscription: Subscription): SubscriptionTheme {
    return resolveSubscriptionTheme(subscription.theme, subscription.name, subscription.category);
  }

  getEyebrow(subscription: Subscription): string {
    const cycle = subscription.billing_cycle.toUpperCase();
    return `${(subscription.category || 'SERVICE').toUpperCase()} · ${cycle}`;
  }

  getIconName(subscription: Subscription): string {
    const theme = this.getTheme(subscription);
    const n = (subscription.name || '').toLowerCase();
    if (n.includes('claude') || n.includes('anthropic')) return 'sparkles';
    if (theme === 'mint' || n.includes('chatgpt') || n.includes('gpt')) return 'bot';
    if (theme === 'neon' || n.includes('spotify') || n.includes('music')) return 'music';
    if (theme === 'rose' || n.includes('apple')) return 'apple';
    if (theme === 'amber' || n.includes('gym') || n.includes('fitness')) return 'dumbbell';
    if (theme === 'scarlet' || n.includes('netflix')) return 'tv';
    if (n.includes('youtube')) return 'play';
    if (theme === 'violet') return 'zap';
    return 'repeat';
  }

  getCycleProgress(subscription: Subscription): number {
    const today = todayIso();
    const renewal = subscription.next_renewal_date;
    const daysLeft = daysBetween(today, renewal);
    const totalDays = subscription.billing_cycle === 'weekly' ? 7
      : subscription.billing_cycle === 'monthly' ? 30
      : subscription.billing_cycle === 'quarterly' ? 91
      : 365;
    if (daysLeft <= 0) return 100;
    if (daysLeft >= totalDays) return 5;
    return Math.max(5, Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100)));
  }

  isDueSoon(subscription: Subscription): boolean {
    const days = daysBetween(todayIso(), subscription.next_renewal_date);
    return days >= 0 && days <= 3;
  }

  isRenewalPassed(subscription: Subscription): boolean {
    return daysBetween(todayIso(), subscription.next_renewal_date) < 0;
  }

  openAdd(): void {
    this.dialog.open(SubscriptionDialogComponent, { width: 'min(620px, calc(100vw - 24px))' });
  }

  openEdit(subscription: Subscription): void {
    this.dialog.open(SubscriptionDialogComponent, {
      data: { subscription: { ...subscription, status: this.statusFor(subscription) } },
      width: 'min(620px, calc(100vw - 24px))',
    });
  }

  renew(subscription: Subscription): void {
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
