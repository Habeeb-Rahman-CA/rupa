import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { LucideAngularModule } from 'lucide-angular';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { Category, CategoryKind, PaymentMode, TxDirection, isSavingsCategory } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { SetOpeningBalanceSheetComponent } from '../dashboard/set-opening-balance-sheet.component';

const NEW_CATEGORY = '__new__';

export interface QuickAddSheetData {
  defaultKind?: CategoryKind;
}

@Component({
  selector: 'app-quick-add-sheet',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    LucideAngularModule,
    TextFieldComponent,
    SelectFieldComponent,
  ],
  template: `
    <div class="sheet">
      <header class="sheet-header">
        <h2>
          @switch (txKind()) {
            @case ('expense') { Expense }
            @case ('income') { Income }
            @case ('savings') { Savings }
          }
        </h2>
        <mat-button-toggle-group
          [value]="txKind()"
          (change)="setTxKind($event.value)"
          hideSingleSelectionIndicator
          class="direction-toggle"
        >
          <mat-button-toggle value="expense">Expense</mat-button-toggle>
          <mat-button-toggle value="income">Income</mat-button-toggle>
          <mat-button-toggle value="savings">Savings</mat-button-toggle>
        </mat-button-toggle-group>
      </header>

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        [value]="amount()"
        (valueChange)="amount.set(toNum($event))"
        (enter)="save()"
        [autofocus]="true"
      >
        <span prefix>₹</span>
      </app-text-field>

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
            label="Select Bank Account"
            placeholder="Choose account"
            [options]="bankAccountOptions()"
            [value]="selectedBankAccountId()"
            (valueChange)="selectedBankAccountId.set($any($event))"
          />
        } @else {
          <div class="no-bank-notice">
            <span>No bank accounts found.</span>
            <button type="button" class="link-btn" (click)="openBankAccounts()">Add Bank Account</button>
          </div>
        }
      }

      <div>
        <div class="micro-label cat-label">Category</div>
        <mat-chip-listbox
          [ngModel]="selectedCategoryId()"
          (ngModelChange)="selectedCategoryId.set($event)"
          aria-label="Category"
        >
          @for (c of relevantCategories(); track c.id) {
            <mat-chip-option [value]="c.id">{{ c.name }}</mat-chip-option>
          }
          <mat-chip-option [value]="NEW_CATEGORY">
            Other
          </mat-chip-option>
        </mat-chip-listbox>
      </div>

      @if (selectedCategoryId() === NEW_CATEGORY) {
        <app-text-field
          #newCatField
          [label]="'New ' + txKind() + ' category'"
          [placeholder]="txKind() === 'savings' ? 'e.g. Gold Reserve' : 'e.g. Petrol'"
          [maxlength]="40"
          [value]="newCategoryName()"
          (valueChange)="newCategoryName.set($event ? String($event) : '')"
          (enter)="save()"
        />
      }

      <app-text-field
        label="Note (optional)"
        [placeholder]="txKind() === 'savings' ? 'e.g. Set aside from monthly salary' : 'A quick reminder for later'"
        [maxlength]="120"
        [value]="notes()"
        (valueChange)="notes.set($event ? String($event) : '')"
      />

      <div class="starting-balance-link">
        Setting your initial money?
        <button type="button" class="link-btn" (click)="openStartingBalance()">
          Set starting balance
        </button>
      </div>

      <div class="actions">
        <button mat-button (click)="close()" [disabled]="submitting()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="!canSave() || submitting()"
        >
          {{ submitting() ? 'Saving…' : (txKind() === 'savings' ? 'Move to Savings' : 'Save') }}
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
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ft-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
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
        justify-content: space-between;
        padding: 10px 14px;
        background: var(--app-bg-hover);
        border-radius: var(--app-radius-md);
        font-size: 13px;
        color: var(--app-ink-muted);
      }
      .cat-label { margin-bottom: 8px; }
      .starting-balance-link {
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--app-accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover { text-decoration: underline; }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .direction-toggle {
        transform: scale(0.9);
        transform-origin: right center;
      }
    `,
  ],
})
export class QuickAddSheetComponent {
  protected readonly NEW_CATEGORY = NEW_CATEGORY;
  protected readonly String = String;

  private readonly ref = inject(MatBottomSheetRef<QuickAddSheetComponent>);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly sheetData = inject<QuickAddSheetData | null>(MAT_BOTTOM_SHEET_DATA, { optional: true });
  private readonly categoriesService = inject(CategoriesService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly txKind = signal<CategoryKind>(this.sheetData?.defaultKind ?? 'expense');
  readonly submitting = signal(false);
  readonly amount = signal<number | null>(null);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly newCategoryName = signal('');
  readonly notes = signal('');

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

  readonly relevantCategories = computed<Category[]>(() => {
    const kind = this.txKind();
    return this.categoriesService.categories().filter((c) => {
      if (kind === 'savings') return isSavingsCategory(c);
      if (kind === 'expense') return c.kind === 'expense' && !isSavingsCategory(c);
      if (kind === 'income') return c.kind === 'income' && !isSavingsCategory(c);
      return false;
    });
  });

  readonly canSave = computed(() => {
    const amt = this.amount();
    if (!amt || amt <= 0) return false;
    if (this.selectedCategoryId() === NEW_CATEGORY && !this.newCategoryName().trim()) {
      return false;
    }
    if (this.paymentMode() === 'bank' && this.bankAccountOptions().length > 0 && !this.selectedBankAccountId()) {
      return false;
    }
    return true;
  });

  toNum(v: string | number | null): number | null {
    return typeof v === 'number' ? v : v ? Number(v) : null;
  }

  setTxKind(next: CategoryKind): void {
    if (this.txKind() === next) return;
    this.txKind.set(next);
    this.selectedCategoryId.set(null);
    this.newCategoryName.set('');
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      let categoryId: string | null = null;
      if (this.selectedCategoryId() === NEW_CATEGORY) {
        const created = await this.categoriesService.create(
          this.newCategoryName(),
          this.txKind(),
        );
        categoryId = created?.id ?? null;
      } else {
        categoryId = this.selectedCategoryId();
      }

      const direction: TxDirection = this.txKind() === 'income' ? 'in' : 'out';
      const mode = this.paymentMode();
      const bankAccountId = mode === 'bank' ? this.selectedBankAccountId() : null;

      await this.transactionsService.create({
        amount: Number(this.amount()),
        direction,
        category_id: categoryId,
        notes: this.notes(),
        payment_mode: mode,
        bank_account_id: bankAccountId,
      });

      const message =
        this.txKind() === 'savings'
          ? 'Moved to savings.'
          : this.txKind() === 'income'
          ? 'Income recorded.'
          : 'Expense recorded.';

      this.snack.open(message, undefined, { duration: 2000 });
      this.ref.dismiss({ saved: true });
    } catch (e: unknown) {
      this.snack.open(errorText(e, 'Couldn’t save — please try again.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  openStartingBalance(): void {
    this.ref.dismiss();
    this.bottomSheet.open(SetOpeningBalanceSheetComponent);
  }

  openBankAccounts(): void {
    this.ref.dismiss();
    void this.router.navigate(['/bank-accounts']);
  }

  close(): void {
    this.ref.dismiss();
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}

