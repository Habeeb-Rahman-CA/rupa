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
import { BillScannerService } from '../../core/services/bill-scanner.service';
import { Category, CategoryKind, PaymentMode, TxDirection, isSavingsCategory } from '../../core/models/domain.models';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { SetOpeningBalanceSheetComponent } from '../dashboard/set-opening-balance-sheet.component';
import { errorText } from '../../shared/utils/error-utils';

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

      <input
        #cameraInput
        type="file"
        accept="image/*"
        capture="environment"
        style="display: none"
        (change)="onFileSelected($event)"
      />
      <input
        #galleryInput
        type="file"
        accept="image/*"
        style="display: none"
        (change)="onFileSelected($event)"
      />

      <div class="scan-bar" [class.is-offline]="isOffline()">
        <span class="scan-tag">
          <lucide-icon [name]="isOffline() ? 'wifi' : (scanningBill() ? 'sparkles' : 'receipt')" class="scan-tag-icon" />
          <span>{{ isOffline() ? 'Offline (AI Disabled)' : (scanningBill() ? 'Scanning…' : 'Scan Bill') }}</span>
        </span>
        <div class="scan-actions">
          <button
            type="button"
            class="scan-btn"
            (click)="cameraInput.click()"
            [disabled]="scanningBill() || isOffline()"
            [title]="isOffline() ? 'AI scanning requires an active internet connection' : 'Take Photo with Camera'"
          >
            <lucide-icon name="camera" class="scan-btn-icon" />
            <span>Camera</span>
          </button>
          <button
            type="button"
            class="scan-btn"
            (click)="galleryInput.click()"
            [disabled]="scanningBill() || isOffline()"
            [title]="isOffline() ? 'AI scanning requires an active internet connection' : 'Upload Image File'"
          >
            <lucide-icon name="upload" class="scan-btn-icon" />
            <span>Upload</span>
          </button>
        </div>
      </div>

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
            <lucide-icon name="alert-circle" />
            <span>No bank accounts added yet.</span>
            <button type="button" class="link-btn" (click)="openBankAccounts()">Add Account</button>
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
      .cat-label { margin-bottom: 8px; }
      .starting-balance-link {
        font-size: 12px;
        color: var(--app-ink-muted);
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
      .scan-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--app-bg-hover, rgba(99, 102, 241, 0.06));
        border: 1px solid var(--app-border, rgba(99, 102, 241, 0.15));
        border-radius: var(--app-radius-md, 10px);
      }
      .scan-tag {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--app-accent, #6366f1);
      }
      .scan-tag-icon {
        width: 15px;
        height: 15px;
      }
      .scan-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .scan-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: var(--app-card-bg, #ffffff);
        border: 1px solid var(--app-border, #e5e7eb);
        border-radius: 6px;
        color: var(--app-ink, #374151);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .scan-btn:hover:not([disabled]) {
        background: var(--app-accent, #6366f1);
        color: #ffffff;
        border-color: var(--app-accent, #6366f1);
      }
      .scan-btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .scan-btn-icon {
        width: 14px;
        height: 14px;
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
  private readonly billScanner = inject(BillScannerService);

  readonly txKind = signal<CategoryKind>(this.sheetData?.defaultKind ?? 'expense');
  readonly submitting = signal(false);
  readonly scanningBill = signal(false);
  readonly isOffline = signal(typeof navigator !== 'undefined' ? !navigator.onLine : false);
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
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOffline.set(false));
      window.addEventListener('offline', () => this.isOffline.set(true));
    }

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

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.scanningBill.set(true);

    try {
      const result = await this.billScanner.extractBill(file);

      if (result.total_amount) {
        const cleaned = result.total_amount.replace(/[^0-9.]/g, '');
        const num = parseFloat(cleaned);
        if (!isNaN(num) && num > 0) {
          this.amount.set(num);
        }
      }

      if (result.title) {
        this.notes.set(result.title);
      }

      const statusMsg = result.total_amount || result.title
        ? `Bill scanned: ${result.title ?? ''} ${result.total_amount ? '₹' + result.total_amount : ''}`.trim()
        : 'Bill scanned, but details could not be parsed automatically.';

      this.snack.open(statusMsg, 'OK', { duration: 3500 });
    } catch (err: unknown) {
      this.snack.open(errorText(err, 'Failed to scan bill image.'), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.scanningBill.set(false);
      input.value = '';
    }
  }

  close(): void {
    this.ref.dismiss();
  }
}

