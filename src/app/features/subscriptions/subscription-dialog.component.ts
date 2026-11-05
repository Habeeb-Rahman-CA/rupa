import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import {
  Subscription,
  SubscriptionBillingCycle,
  SubscriptionStatus,
} from '../../core/models/domain.models';
import {
  CreateSubscriptionInput,
  SubscriptionsService,
  UpdateSubscriptionInput,
} from '../../core/services/subscriptions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';

export interface SubscriptionDialogData {
  subscription?: Subscription;
}

@Component({
  selector: 'app-subscription-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div>
          <h2 mat-dialog-title>{{ isEdit ? 'Edit Subscription' : 'Add Subscription' }}</h2>
          <p class="dialog-subtitle">Track the plan and its renewal schedule.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <div class="full">
            <app-text-field
              label="Name"
              placeholder="e.g. Netflix, Figma, Gym membership"
              leadIcon="tag"
              [value]="name()"
              [invalid]="touched() && !name().trim()"
              (valueChange)="name.set($any($event) ?? '')"
              [autofocus]="true"
            />
          </div>

          <app-text-field
            label="Category"
            placeholder="e.g. Entertainment"
            leadIcon="layers-3"
            [value]="category()"
            (valueChange)="category.set($any($event) ?? '')"
          />
          <app-text-field
            label="Amount"
            placeholder="0.00"
            type="number"
            inputmode="decimal"
            [min]="0"
            [step]="0.01"
            leadIcon="wallet"
            [value]="amount()"
            [invalid]="touched() && !amountValid()"
            (valueChange)="amount.set(toNumber($event))"
          ><span prefix>₹</span></app-text-field>

          <div class="full field-group">
            <label class="ft-label">Billing cycle</label>
            <mat-button-toggle-group
              [value]="billingCycle()"
              (change)="billingCycle.set($event.value)"
              hideSingleSelectionIndicator
              class="cycle-toggle"
            >
              <mat-button-toggle value="weekly">Weekly</mat-button-toggle>
              <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
              <mat-button-toggle value="quarterly">Quarterly</mat-button-toggle>
              <mat-button-toggle value="yearly">Yearly</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          <app-date-field
            label="Start date"
            placeholder="When it started"
            [value]="startDate()"
            (valueChange)="startDate.set($event)"
          />
          <app-date-field
            label="Next renewal date"
            placeholder="Next charge / renewal"
            [value]="nextRenewalDate()"
            (valueChange)="nextRenewalDate.set($event)"
          />
          
          <div class="full">
            <app-date-field
              label="Expiry date (optional)"
              placeholder="Does not expire"
              [value]="endDate()"
              (valueChange)="endDate.set($event)"
            />
            @if (endDate()) {
              <button type="button" class="clear-date-btn" (click)="endDate.set(null)">Clear expiry date</button>
            }
          </div>

          <div class="full">
            <app-select-field
              label="Payment account (optional)"
              placeholder="No account specified"
              [options]="accountOptions()"
              [value]="paymentAccountId()"
              (valueChange)="paymentAccountId.set($any($event) || null)"
            />
          </div>

          <div class="full field-group">
            <label class="ft-label">Status</label>
            <mat-button-toggle-group
              [value]="status()"
              (change)="setStatus($event.value)"
              hideSingleSelectionIndicator
              class="status-toggle"
            >
              @for (option of statusOptions; track option.value) {
                <mat-button-toggle [value]="option.value">{{ option.label }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          @if (status() === 'cancelled') {
            <div class="full">
              <app-date-field
                label="Cancelled on"
                placeholder="Cancellation date"
                [value]="cancelledOn()"
                (valueChange)="cancelledOn.set($event)"
              />
            </div>
          }

          <label class="full checkbox-row">
            <input
              type="checkbox"
              [checked]="autoRenewal()"
              (change)="autoRenewal.set($any($event.target).checked)"
            />
            <span>
              <strong>Auto-renewal expected</strong>
              <small>Keep this on when the service is set to renew automatically.</small>
            </span>
          </label>

          <div class="full">
            <app-text-field
              label="Notes (optional)"
              placeholder="Trial details, cancellation terms, or reminders"
              leadIcon="sticky-note"
              [maxlength]="240"
              [value]="notes()"
              (valueChange)="notes.set($any($event) ?? '')"
            />
          </div>

          @if (isEdit && amountChanged()) {
            <div class="full price-notice">
              <lucide-icon name="trending-up" />
              <span>The amount change will be added to the price history.</span>
            </div>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : (isEdit ? 'Save changes' : 'Add Subscription') }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
    h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
      .dialog-container { max-width: 620px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .header-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 13px; background: var(--app-accent-soft); color: var(--app-accent); }
      .header-icon lucide-icon { width: 20px; height: 20px; }
      .dialog-title { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { max-height: 72vh; padding: 18px 16px !important; }
      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
      .full { grid-column: 1 / -1; }
      .field-group { display: flex; flex-direction: column; gap: 6px; }
      .ft-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .cycle-toggle, .status-toggle { display: flex; width: 100%; overflow-x: auto; }
      .cycle-toggle mat-button-toggle, .status-toggle mat-button-toggle { flex: 1 0 auto; }
      .date-help, .price-notice { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--app-accent-soft); color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .date-help lucide-icon, .price-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; color: var(--app-accent); }
      .clear-date-btn { display: block; margin: 5px 2px 0 auto; border: 0; padding: 0; background: transparent; color: var(--app-accent); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
      .checkbox-row { display: flex; align-items: flex-start; gap: 10px; padding: 2px 2px 0; cursor: pointer; }
      .checkbox-row input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--app-accent); }
      .checkbox-row span { display: flex; flex-direction: column; gap: 2px; }
      .checkbox-row strong { font-size: 13px; font-weight: 600; }
      .checkbox-row small { color: var(--app-ink-muted); font-size: 12px; }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
      @media (max-width: 540px) { .form-grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class SubscriptionDialogComponent {
  private readonly ref = inject(MatDialogRef<SubscriptionDialogComponent>);
  private readonly data = inject<SubscriptionDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = !!this.data.subscription;
  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly name = signal(this.data.subscription?.name ?? '');
  readonly category = signal(this.data.subscription?.category ?? '');
  readonly amount = signal<number | null>(this.data.subscription?.amount ?? null);
  readonly billingCycle = signal<SubscriptionBillingCycle>(this.data.subscription?.billing_cycle ?? 'monthly');
  readonly startDate = signal<Date | null>(parseIsoDate(this.data.subscription?.start_date) ?? new Date());
  readonly nextRenewalDate = signal<Date | null>(parseIsoDate(this.data.subscription?.next_renewal_date) ?? new Date());
  readonly endDate = signal<Date | null>(parseIsoDate(this.data.subscription?.end_date));
  readonly paymentAccountId = signal<string | null>(this.data.subscription?.payment_account_id ?? null);
  readonly autoRenewal = signal(this.data.subscription?.auto_renewal ?? true);
  readonly status = signal<SubscriptionStatus>(this.data.subscription?.status ?? 'active');
  readonly cancelledOn = signal<Date | null>(parseIsoDate(this.data.subscription?.cancelled_on));
  readonly notes = signal(this.data.subscription?.notes ?? '');

  readonly statusOptions: Array<{ value: SubscriptionStatus; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' },
  ];

  readonly accountOptions = () => [
    { value: '', label: 'No account specified', icon: 'wallet' },
    ...this.bankAccountsService.bankAccounts().map<SelectOption<string>>((account) => ({
      value: account.id,
      label: account.is_primary ? `${account.bank_name} · ${account.account_name} ★` : `${account.bank_name} · ${account.account_name}`,
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    })),
  ];

  amountChanged(): boolean {
    return this.isEdit && this.amount() !== null && this.amount() !== this.data.subscription?.amount;
  }

  canSave(): boolean {
    const start = this.startDate();
    const nextRenewal = this.nextRenewalDate();
    const end = this.endDate();
    return !!this.name().trim() && this.amountValid() && !!start && !!nextRenewal && nextRenewal >= start && (!end || end >= start);
  }

  amountValid(): boolean {
    const value = this.amount();
    return !!value && value > 0;
  }

  setStatus(value: SubscriptionStatus): void {
    this.status.set(value);
    if (value === 'cancelled' && !this.cancelledOn()) this.cancelledOn.set(new Date());
  }

  toNumber(value: string | number | null): number | null {
    return value === '' || value == null ? null : Number(value);
  }

  async save(): Promise<void> {
    this.touched.set(true);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    const base = {
      name: this.name(),
      category: this.category(),
      amount: Number(this.amount()),
      billing_cycle: this.billingCycle(),
      start_date: toIsoDate(this.startDate()!),
      next_renewal_date: toIsoDate(this.nextRenewalDate()!),
      end_date: this.endDate() ? toIsoDate(this.endDate()!) : null,
      payment_account_id: this.paymentAccountId(),
      auto_renewal: this.autoRenewal(),
      status: this.status(),
      cancelled_on: this.cancelledOn() ? toIsoDate(this.cancelledOn()!) : null,
      notes: this.notes(),
    } satisfies CreateSubscriptionInput;

    try {
      if (this.isEdit && this.data.subscription) {
        const changes: UpdateSubscriptionInput = {
          ...base,
          price_change_effective_on: toIsoDate(new Date()),
        };
        await this.subscriptionsService.update(this.data.subscription.id, changes);
        this.snack.open('Subscription updated.', undefined, { duration: 2000 });
      } else {
        await this.subscriptionsService.create(base);
        this.snack.open('Subscription added.', undefined, { duration: 2000 });
      }
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t save subscription — please try again.'), 'Dismiss', { duration: 4000 });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
