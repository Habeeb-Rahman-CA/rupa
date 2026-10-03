import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { EventsService, ParticipantWithMeta } from '../../core/services/events.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { PaymentMode } from '../../core/models/domain.models';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';

export interface AddEventExpenseSheetData {
  eventId: string;
  participants: ParticipantWithMeta[];
}

@Component({
  selector: 'app-add-event-expense-sheet',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    LucideAngularModule,
    SignedMoneyPipe,
    TextFieldComponent,
    DateFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <div class="sheet">
      <h2>Add an expense</h2>

      <app-text-field
        label="What was it?"
        placeholder="e.g. Flight tickets, hotel, dinner"
        [maxlength]="80"
        [value]="description()"
        (valueChange)="description.set($any($event) ?? '')"
        [autofocus]="true"
      />

      <div class="two">
        <app-text-field
          class="grow"
          label="Amount"
          placeholder="0.00"
          type="number"
          inputmode="decimal"
          [min]="0"
          [step]="0.01"
          [value]="amount()"
          (valueChange)="amount.set(toNum($event))"
        >
          <span prefix>₹</span>
        </app-text-field>

        <app-date-field
          class="grow"
          label="Paid on"
          [value]="paidOn()"
          (valueChange)="paidOn.set($event)"
        />
      </div>

      <div class="field-group">
        <label class="ft-label">Payment Mode</label>
        <mat-button-toggle-group
          [value]="paymentMode()"
          (change)="setPaymentMode($event.value)"
          hideSingleSelectionIndicator
          class="payment-mode-toggle"
        >
          <mat-button-toggle value="cash">Cash</mat-button-toggle>
          <mat-button-toggle value="bank">Bank Account</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (paymentMode() === 'bank') {
        @if (bankAccountOptions().length > 0) {
          <app-select-field
            label="Bank Account"
            placeholder="Select Bank Account"
            [options]="bankAccountOptions()"
            [value]="selectedBankAccountId()"
            (valueChange)="selectedBankAccountId.set($any($event))"
          />
        } @else {
          <div class="no-bank-notice">
            <lucide-icon name="alert-circle" />
            <span>No bank accounts added yet.</span>
            <button type="button" class="link-btn" (click)="openBankAccounts()">Add Account</button>
          </div>
        }
      }

      <div class="participants-head">
        <label class="ft-label">Split between</label>
        <button mat-button (click)="toggleAll()" type="button">
          {{ allSelected() ? 'Clear' : 'Everyone' }}
        </button>
      </div>
      <ul class="participants">
        @for (p of data.participants; track p.id) {
          <li class="p-row">
            <mat-checkbox
              [checked]="isSelected(p.id)"
              (change)="toggle(p.id, $event.checked)"
            >
              {{ p.name }}
            </mat-checkbox>
          </li>
        }
      </ul>

      @if (perHead() > 0) {
        <div class="per-head">
          Each person pays <strong>{{ perHead() | signedMoney }}</strong>
          ({{ selectedIds().length }} people)
        </div>
      }

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .sheet {
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .two { display: flex; gap: 12px; }
      .grow { flex: 1; min-width: 0; }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }
      .payment-mode-toggle {
        width: 100%;
        display: flex;
      }
      .payment-mode-toggle mat-button-toggle {
        flex: 1;
      }
      .no-bank-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--app-bg-hover);
        border: 1px dashed var(--app-hairline);
        border-radius: var(--app-radius-md);
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .no-bank-notice lucide-icon {
        width: 16px;
        height: 16px;
        color: var(--app-ink-subtle);
        flex: 0 0 auto;
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        margin-left: auto;
        color: var(--app-accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover { text-decoration: underline; }
      .participants-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .participants {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--app-hairline);
        border-radius: 12px;
        max-height: 220px;
        overflow: auto;
      }
      .p-row {
        padding: 6px 12px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .p-row:last-child { border-bottom: 0; }
      .per-head {
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
    `,
  ],
})
export class AddEventExpenseSheetComponent {
  private readonly ref = inject(MatBottomSheetRef<AddEventExpenseSheetComponent>);
  private readonly eventsService = inject(EventsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly data = inject<AddEventExpenseSheetData>(MAT_BOTTOM_SHEET_DATA);

  readonly description = signal('');
  readonly amount = signal<number | null>(null);
  readonly paidOn = signal<Date | null>(new Date());
  readonly submitting = signal(false);
  readonly selectedIds = signal<string[]>(this.data.participants.map((p) => p.id));

  readonly paymentMode = signal<PaymentMode>('cash');
  readonly selectedBankAccountId = signal<string | null>(null);

  readonly bankAccountOptions = computed<SelectOption[]>(() => {
    return this.bankAccountsService.bankAccounts().map((acc) => ({
      value: acc.id,
      label: acc.is_primary ? `${acc.bank_name} (${acc.account_name}) ★` : `${acc.bank_name} (${acc.account_name})`,
      icon: 'landmark',
    }));
  });

  constructor() {
    effect(() => {
      const primary = this.bankAccountsService.primaryAccount();
      const accounts = this.bankAccountsService.bankAccounts();
      if (primary && !this.selectedBankAccountId()) {
        this.selectedBankAccountId.set(primary.id);
      }
      if (accounts.length > 0 && this.paymentMode() === 'cash' && !this.userExplicitlySetCash) {
        this.paymentMode.set('bank');
        if (primary) {
          this.selectedBankAccountId.set(primary.id);
        }
      }
    });
  }

  private userExplicitlySetCash = false;

  setPaymentMode(mode: PaymentMode): void {
    this.userExplicitlySetCash = mode === 'cash';
    this.paymentMode.set(mode);
    if (mode === 'bank' && !this.selectedBankAccountId()) {
      const primary = this.bankAccountsService.primaryAccount();
      if (primary) {
        this.selectedBankAccountId.set(primary.id);
      }
    }
  }

  readonly canSave = computed(
    () =>
      this.description().trim().length > 0 &&
      !!this.amount() &&
      this.amount()! > 0 &&
      this.selectedIds().length > 0 &&
      !!this.paidOn() &&
      !(this.paymentMode() === 'bank' && this.bankAccountOptions().length > 0 && !this.selectedBankAccountId()),
  );

  readonly perHead = computed(() => {
    const amt = this.amount() ?? 0;
    const count = this.selectedIds().length;
    return count > 0 ? Math.round((amt / count) * 100) / 100 : 0;
  });

  readonly allSelected = computed(
    () => this.selectedIds().length === this.data.participants.length,
  );

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string, checked: boolean): void {
    const set = new Set(this.selectedIds());
    if (checked) set.add(id); else set.delete(id);
    this.selectedIds.set([...set]);
  }

  toggleAll(): void {
    if (this.allSelected()) this.selectedIds.set([]);
    else this.selectedIds.set(this.data.participants.map((p) => p.id));
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const mode = this.paymentMode();
      const bankId = mode === 'bank' ? this.selectedBankAccountId() : null;

      await this.eventsService.addExpense({
        eventId: this.data.eventId,
        description: this.description(),
        amount: Number(this.amount()),
        paid_on: toIsoDate(this.paidOn()!),
        participantIds: this.selectedIds(),
        payment_mode: mode,
        bank_account_id: bankId,
      });
      this.snack.open('Expense added to the split.', undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.dismiss();
  }

  openBankAccounts(): void {
    this.ref.dismiss();
    void this.router.navigate(['/bank-accounts']);
  }
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
