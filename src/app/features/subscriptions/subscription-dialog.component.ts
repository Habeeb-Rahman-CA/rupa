import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import {
  SUBSCRIPTION_THEMES,
  Subscription,
  SubscriptionBillingCycle,
  SubscriptionStatus,
  SubscriptionTheme,
} from '../../core/models/domain.models';
import {
  CreateSubscriptionInput,
  detectSubscriptionTheme,
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
          <p class="dialog-subtitle">Configure subscription plan, expiry, and billing details.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          <div class="full">
            <app-text-field
              label="Name"
              placeholder="e.g. Claude, Spotify, ChatGPT, Gym, Apple Music"
              leadIcon="tag"
              [value]="name()"
              [invalid]="touched() && !name().trim()"
              (valueChange)="onNameChange($any($event) ?? '')"
              [autofocus]="true"
            />
          </div>

          <!-- Theme Color Swatches -->
          <div class="full field-group theme-group">
            <div class="theme-header">
              <label class="ft-label">Theme Color</label>
              <span class="current-theme-label">{{ currentThemeTitle() }}</span>
            </div>
            <div class="theme-picker">
              @for (t of themeOptions; track t.id) {
                <button
                  type="button"
                  class="theme-swatch"
                  [attr.data-theme]="t.id"
                  [class.active]="theme() === t.id"
                  (click)="selectTheme(t.id)"
                  [title]="t.name + ' · ' + t.subtitle"
                  [attr.aria-label]="t.name"
                >
                  @if (theme() === t.id) {
                    <lucide-icon name="check" class="check-icon" />
                  }
                </button>
              }
            </div>
          </div>

          <app-text-field
            label="Category"
            placeholder="e.g. AI, Audio, Fitness, Entertainment"
            leadIcon="layers-3"
            [value]="category()"
            (valueChange)="onCategoryChange($any($event) ?? '')"
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
            [invalid]="touched() && !startDate()"
            (valueChange)="startDate.set($event)"
          />
          <app-date-field
            label="Expiry date"
            placeholder="When the plan ends"
            [value]="endDate()"
            [invalid]="touched() && !endDateValid()"
            (valueChange)="endDate.set($event)"
          />

          <div class="full">
            <app-select-field
              label="Payment account"
              placeholder="Select an account"
              [options]="accountOptions()"
              [value]="paymentAccountId()"
              [invalid]="touched() && !paymentAccountId()"
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

          <div class="full">
            <app-text-field
              label="Notes (optional)"
              placeholder="Trial details, plan tier, cancellation terms, or perks"
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
      .dialog-container { max-width: 640px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .dialog-title { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { max-height: 75vh; padding: 16px !important; }

      /* Swatches */
      .theme-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .current-theme-label { font-size: 11px; font-weight: 600; color: var(--app-accent); }
      .theme-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        padding: 4px 2px;
      }
      .theme-swatch {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        display: grid;
        place-items: center;
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.24);
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        padding: 0;
        background: transparent;
      }
      .theme-swatch:hover {
        transform: scale(1.1);
      }
      .theme-swatch.active {
        border-color: #ffffff;
        box-shadow: 0 0 0 2px var(--app-canvas), 0 0 0 4px var(--app-accent);
        transform: scale(1.14);
      }
      .theme-swatch .check-icon {
        width: 17px;
        height: 17px;
      }

      /* Swatch bubble colors */
      .theme-swatch[data-theme='mint'] { background: linear-gradient(135deg, #10a37f, #054e3b); }
      .theme-swatch[data-theme='neon'] { background: linear-gradient(135deg, #1db954, #0b5e28); }
      .theme-swatch[data-theme='rose'] { background: linear-gradient(135deg, #fc3c44, #8b004f); }
      .theme-swatch[data-theme='amber'] { background: linear-gradient(135deg, #ff6b35, #b43403); }
      .theme-swatch[data-theme='scarlet'] { background: linear-gradient(135deg, #e50914, #7f0007); }
      .theme-swatch[data-theme='slate'] { background: linear-gradient(135deg, #475569, #0f172a); }
      .theme-swatch[data-theme='violet'] { background: linear-gradient(135deg, #6366f1, #312e81); }

      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
      .full { grid-column: 1 / -1; }
      .field-group { display: flex; flex-direction: column; gap: 6px; }
      .ft-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .cycle-toggle, .status-toggle { display: flex; width: 100%; overflow-x: auto; }
      .cycle-toggle mat-button-toggle, .status-toggle mat-button-toggle { flex: 1 0 auto; }
      .date-help, .price-notice { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--app-accent-soft); color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .date-help lucide-icon, .price-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; color: var(--app-accent); }
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
  readonly endDate = signal<Date | null>(
    parseIsoDate(this.data.subscription?.end_date) ?? parseIsoDate(this.data.subscription?.next_renewal_date),
  );
  readonly paymentAccountId = signal<string | null>(this.data.subscription?.payment_account_id ?? null);
  readonly status = signal<SubscriptionStatus>(this.data.subscription?.status ?? 'active');
  readonly cancelledOn = signal<Date | null>(parseIsoDate(this.data.subscription?.cancelled_on));
  readonly notes = signal(this.data.subscription?.notes ?? '');

  readonly theme = signal<SubscriptionTheme>(
    this.data.subscription?.theme ?? detectSubscriptionTheme(this.name(), this.category()),
  );
  readonly userSelectedTheme = signal(!!this.data.subscription?.theme);

  readonly themeOptions = SUBSCRIPTION_THEMES;

  readonly currentThemeTitle = computed(() => {
    const active = this.theme();
    const found = SUBSCRIPTION_THEMES.find((item) => item.id === active);
    return found ? `${found.name} (${found.subtitle})` : 'Custom';
  });

  readonly statusOptions: Array<{ value: SubscriptionStatus; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' },
  ];

  readonly accountOptions = () =>
    this.bankAccountsService.bankAccounts().map<SelectOption<string>>((account) => ({
      value: account.id,
      label: account.is_primary ? `${account.bank_name} · ${account.account_name} ★` : `${account.bank_name} · ${account.account_name}`,
      icon: account.card_type === 'credit' ? 'credit-card' : 'landmark',
    }));

  onNameChange(val: string): void {
    this.name.set(val);
    if (!this.userSelectedTheme()) {
      const suggested = detectSubscriptionTheme(val, this.category());
      this.theme.set(suggested);
    }
  }

  onCategoryChange(val: string): void {
    this.category.set(val);
    if (!this.userSelectedTheme()) {
      const suggested = detectSubscriptionTheme(this.name(), val);
      this.theme.set(suggested);
    }
  }

  selectTheme(themeId: SubscriptionTheme): void {
    this.userSelectedTheme.set(true);
    this.theme.set(themeId);
  }

  amountChanged(): boolean {
    return this.isEdit && this.amount() !== null && this.amount() !== this.data.subscription?.amount;
  }

  canSave(): boolean {
    const start = this.startDate();
    return !!this.name().trim() && this.amountValid() && !!start && this.endDateValid() && !!this.paymentAccountId();
  }

  endDateValid(): boolean {
    const end = this.endDate();
    const start = this.startDate();
    return !!end && !!start && end >= start;
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
      next_renewal_date: toIsoDate(this.endDate()!),
      end_date: toIsoDate(this.endDate()!),
      payment_account_id: this.paymentAccountId(),
      status: this.status(),
      theme: this.theme(),
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
