import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { LucideAngularModule } from 'lucide-angular';

import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { BillScannerService, ExtractionResult } from '../../core/services/bill-scanner.service';
import { AiConsentService } from '../../core/services/ai-consent.service';
import { openAiConsent } from '../../shared/components/ai-consent-dialog.component';
import { AudioCaptureService } from '../../core/services/audio-capture.service';
import { SpeechToTextService } from '../../core/services/speech-to-text.service';
import { VoiceExpenseParserService } from '../../core/services/voice-expense-parser.service';
import { VoicePreviewComponent, VoicePreviewData } from './voice-preview.component';
import { VoiceEntry } from '../../core/services/voice-expense-parser.service';
import {
  Category,
  CategoryKind,
  PaymentMode,
  TxDirection,
  isSavingsCategory,
} from '../../core/models/domain.models';
import { isWalletSpendingCategory } from '../../shared/utils/category-utils';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { SheetDragCloseDirective } from '../../shared/directives/sheet-drag-close.directive';
import { SetOpeningBalanceSheetComponent } from '../dashboard/set-opening-balance-sheet.component';
import { errorText } from '../../shared/utils/error-utils';
import { environment } from '../../../environments/environment';

const NEW_CATEGORY = '__new__';

export interface QuickAddSheetData {
  defaultKind?: CategoryKind;
}

@Component({
  selector: 'app-quick-add-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SheetDragCloseDirective,
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
      <div appSheetDragClose></div>
      <header class="sheet-header">
        <h2>
          @switch (txKind()) {
            @case ('expense') {
              Expense
            }
            @case ('income') {
              Income
            }
            @case ('savings') {
              Savings
            }
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
        accept="image/*,image/heic,image/heif"
        capture="environment"
        style="display: none"
        (change)="onFileSelected($event)"
      />
      <input
        #galleryInput
        type="file"
        accept="image/*,image/heic,image/heif"
        style="display: none"
        (change)="onFileSelected($event)"
      />

      <div class="scan-bar">
        <span class="scan-tag">
          <lucide-icon
            [name]="scanningBill() ? 'sparkles' : 'bot'"
            class="scan-tag-icon"
            [class.spin]="scanningBill()"
          />
          <span>
            {{
              scanningBill() ? 'AI Scanning…' : 'AI Bill Scanner'
            }}
          </span>
        </span>
        <div class="scan-actions">
          <button
            type="button"
            class="scan-btn"
            (click)="cameraInput.click()"
            [disabled]="scanningBill()"
            [title]="'Take Photo with Camera'"
          >
            <lucide-icon name="camera" class="scan-btn-icon" />
            <span>Camera</span>
          </button>
          <button
            type="button"
            class="scan-btn"
            (click)="galleryInput.click()"
            [disabled]="scanningBill()"
            [title]="'Upload Image File'"
          >
            <lucide-icon name="upload" class="scan-btn-icon" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      @if (scanningBill()) {
        <div class="scan-progress">
          <div class="scan-progress-track">
            <div
              class="scan-progress-fill"
              [style.width.%]="scanProgress()"
            ></div>
          </div>
          <span class="scan-progress-label">{{ scanProgress() }}%</span>
        </div>
      }

      @if (sttBeta) {
      <div class="voice-bar">
        <button
          type="button"
          class="voice-btn"
          [class.recording]="recordingVoice()"
          [disabled]="submitting() || scanningBill()"
          (click)="onVoiceRecord()"
          [title]="recordingVoice() ? 'Stop recording' : 'Voice input'"
        >
          <lucide-icon
            [name]="recordingVoice() ? 'stop-circle' : 'mic'"
            class="voice-btn-icon"
            [class.pulse]="recordingVoice()"
          />
          <span>{{ recordingVoice() ? 'Listening…' : 'Voice input' }}</span>
          @if (!recordingVoice()) {
            <span class="voice-beta-badge">Beta</span>
          }
        </button>
        @if (recordingVoice()) {
          <span class="voice-hint">Speak your entries, then tap to stop</span>
        }
        @if (voiceRawText()) {
          <p class="voice-heard">Heard: {{ voiceRawText() }}</p>
        }
      </div>
      }

      <app-text-field
        label="Amount"
        placeholder="0.00"
        type="number"
        inputmode="decimal"
        [min]="0"
        [step]="0.01"
        autocomplete="off"
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
          <mat-chip-option [value]="NEW_CATEGORY"> + New category </mat-chip-option>
        </mat-chip-listbox>
      </div>

      @if (selectedCategoryId() === NEW_CATEGORY) {
      <app-text-field
        #newCatField
        [label]="'New ' + txKind() + ' category'"
        [placeholder]="txKind() === 'savings' ? 'e.g. Gold Reserve' : 'e.g. Petrol'"
        autocomplete="off"
        [maxlength]="40"
        [value]="newCategoryName()"
        (valueChange)="newCategoryName.set($event ? String($event) : '')"
        (enter)="save()"
      />
      }

      <app-text-field
        label="Note (optional)"
        [placeholder]="
          txKind() === 'savings'
            ? 'e.g. Set aside from monthly salary'
            : 'A quick reminder for later'
        "
        autocomplete="off"
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
          {{ submitting() ? 'Saving…' : txKind() === 'savings' ? 'Move to Savings' : 'Save' }}
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
      .ft-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
      }
      .payment-mode-toggle {
        width: 100%;
        display: flex;
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
      .cat-label {
        margin-bottom: 8px;
      }
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
      .link-btn:hover {
        text-decoration: underline;
      }
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
        padding: 8px 14px;
        background: var(--app-surface);
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-sm);
      }
      .scan-tag {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        color: var(--app-accent);
        letter-spacing: 0.2px;
      }
      .scan-tag-icon {
        width: 16px;
        height: 16px;
        animation: ai-pulse 2s ease-in-out infinite;
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
        padding: 5px 12px;
        background: transparent;
        border: 1px solid var(--app-hairline);
        border-radius: 8px;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .scan-btn:hover:not([disabled]) {
        background: var(--app-accent-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
      }
      .scan-btn:active:not([disabled]) {
        transform: translateY(-1px);
      }
      .scan-btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .scan-btn-icon {
        width: 14px;
        height: 14px;
      }
      .scan-progress {
        margin-top: 2px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .scan-progress-track {
        flex: 1;
        height: 4px;
        background: var(--app-bg-hover);
        border-radius: 2px;
        overflow: hidden;
      }
      .scan-progress-fill {
        height: 100%;
        background: var(--app-accent);
        border-radius: 2px;
        transition: width 0.2s ease;
      }
      .scan-progress-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--app-ink-muted);
        min-width: 28px;
      }
      .scan-tag-icon.spin {
        animation: ai-blink 1.2s ease-in-out infinite;
      }

      .voice-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: var(--app-surface);
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-sm);
        margin-top: 8px;
      }
      .voice-btn {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 14px;
        border: 1px solid var(--app-hairline);
        border-radius: 10px;
        background: transparent;
        color: var(--app-ink-muted);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .voice-btn:not([disabled]):hover {
        background: var(--app-accent-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
      }
      .voice-btn.recording {
        background: var(--app-negative);
        border-color: var(--app-negative);
        color: #fff;
      }
      .voice-btn.recording:hover {
        background: var(--app-negative);
        border-color: var(--app-negative);
      }
      .voice-btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .voice-beta-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 6px;
        padding: 1px 7px;
        border: 1px solid var(--app-accent);
        border-radius: 10px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        opacity: 0.9;
      }
      .voice-btn-icon {
        width: 16px;
        height: 16px;
      }
      .voice-btn-icon.pulse {
        animation: ai-pulse 2s ease-in-out infinite;
        color: #fff !important;
      }
      .voice-hint {
        font-size: 12px;
        color: var(--app-ink-muted);
        flex: 1 1 auto;
      }
      .voice-heard {
        margin: 6px 14px 0;
        font-size: 12.5px;
        color: var(--app-accent);
        font-weight: 600;
      }

      @keyframes ai-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.1); }
      }
      @keyframes ai-blink {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.9); }
      }
      @keyframes ai-spin {
        to { transform: rotate(360deg); }
      }
    `,
  ],
})
export class QuickAddSheetComponent {
  protected readonly NEW_CATEGORY = NEW_CATEGORY;
  protected readonly String = String;

  private readonly ref = inject(MatBottomSheetRef<QuickAddSheetComponent>);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly sheetData = inject<QuickAddSheetData | null>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });
  private readonly categoriesService = inject(CategoriesService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly billScanner = inject(BillScannerService);
  private readonly dialog = inject(MatDialog);
  private readonly aiConsent = inject(AiConsentService);
  private readonly audioCapture = inject(AudioCaptureService);
  private readonly speechToText = inject(SpeechToTextService);
  private readonly voiceParser = inject(VoiceExpenseParserService);

  readonly txKind = signal<CategoryKind>(this.sheetData?.defaultKind ?? 'expense');
  readonly submitting = signal(false);
  readonly scanningBill = signal(false);
  readonly amount = signal<number | null>(null);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly newCategoryName = signal('');
  readonly notes = signal('');
  readonly scanProgress = signal(0);
  readonly recordingVoice = signal(false);
  readonly voiceRawText = signal('');
  readonly sttBeta = environment.sttBeta;

  readonly paymentMode = signal<PaymentMode>('bank');
  readonly selectedBankAccountId = signal<string | null>(null);

  readonly bankAccountOptions = computed<SelectOption[]>(() => {
    return this.bankAccountsService.bankAccounts().map((acc) => ({
      value: acc.id,
      label: acc.is_primary
        ? `${acc.bank_name} (${acc.account_name}) ★`
        : `${acc.bank_name} (${acc.account_name})`,
      icon: 'landmark',
    }));
  });

  constructor() {
    effect(() => {
      const primary = this.bankAccountsService.primaryAccount();
      // Default to the primary bank account only when none has been selected yet.
      // Never override the user's explicit payment-mode choice.
      if (primary && !this.selectedBankAccountId()) {
        this.selectedBankAccountId.set(primary.id);
      }
    });

    // Animate a pseudo-progress bar while scanning so the user knows work is
    // happening. It climbs to ~90% and holds until the real scan completes,
    // then jumps to 100% before being hidden.
    effect(() => {
      const scanning = this.scanningBill();
      if (!scanning) {
        this.scanProgress.set(0);
        return;
      }
      let progress = 0;
      const timer = setInterval(() => {
        if (!this.scanningBill()) {
          this.scanProgress.set(100);
          clearInterval(timer);
          return;
        }
        progress = Math.min(progress + 5, 90);
        this.scanProgress.set(progress);
      }, 250);
      return () => clearInterval(timer);
    });
  }

  setPaymentMode(mode: PaymentMode): void {
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
    const filtered = this.categoriesService.categories().filter((c) => {
      // Wallet spending is recorded through the wallet flow only — its system
      // category must not be offered for manual expenses.
      if (isWalletSpendingCategory(c)) return false;
      if (kind === 'savings') return isSavingsCategory(c);
      if (kind === 'expense') return c.kind === 'expense' && !isSavingsCategory(c);
      if (kind === 'income') return c.kind === 'income' && !isSavingsCategory(c);
      return false;
    });

    // Count how many transactions use each category, then sort most-used first.
    const usage = new Map<string, number>();
    for (const t of this.transactionsService.transactions()) {
      if (t.category_id) usage.set(t.category_id, (usage.get(t.category_id) ?? 0) + 1);
    }

    return filtered.sort((a, b) => {
      const ba = usage.get(b.id) ?? 0;
      const aa = usage.get(a.id) ?? 0;
      if (ba !== aa) return ba - aa;
      return a.name.localeCompare(b.name);
    });
  });

  readonly canSave = computed(() => {
    const amt = this.amount();
    if (!amt || amt <= 0) return false;
    if (this.selectedCategoryId() === NEW_CATEGORY && !this.newCategoryName().trim()) {
      return false;
    }
    if (
      this.paymentMode() === 'bank' &&
      this.bankAccountOptions().length > 0 &&
      !this.selectedBankAccountId()
    ) {
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

  /**
   * Tries the AI's top category pick, then each ranked alternative, in order,
   * against the user's relevant categories (case-insensitive). On exact match
   * selects the existing category. On no match, pre-fills "+ New category"
   * with the top suggestion so the existing save flow creates it.
   */
  matchCategory(suggested: string | null, alternatives: string[]): void {
    const categories = this.relevantCategories();
    const candidates: string[] = [];
    if (suggested && suggested.trim()) candidates.push(suggested.trim());
    for (const alt of alternatives) {
      if (alt.trim()) candidates.push(alt.trim());
    }

    for (const candidate of candidates) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === candidate.toLowerCase(),
      );
      if (match) {
        this.selectedCategoryId.set(match.id);
        this.newCategoryName.set('');
        return;
      }
    }

    // No existing category matched — offer to create a new one with the top suggestion.
    this.selectedCategoryId.set(NEW_CATEGORY);
    if (suggested && suggested.trim()) {
      this.newCategoryName.set(suggested.trim());
    }
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      let categoryId: string | null = null;
      if (this.selectedCategoryId() === NEW_CATEGORY) {
        const created = await this.categoriesService.create(this.newCategoryName(), this.txKind());
        // Never submit the transaction without the category the user just
        // entered — a null category_id would fall back to "Expense"/"Income".
        if (!created?.id) {
          throw new Error('Couldn’t create the category — please try again.');
        }
        categoryId = created.id;
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

    // Consent gate: the image is only sent to the external AI provider after
    // an explicit "Allow". Prompt on the first scan; remember the choice so
    // later scans skip the dialog. A prior decline re-prompts so the user can
    // reverse it. Declining keeps scanning blocked and leaves manual entry.
    if (!this.aiConsent.granted()) {
      const allowed = await openAiConsent(this.dialog);
      if (!allowed) {
        this.aiConsent.deny();
        input.value = '';
        this.snack.open(
          'No problem — enter the amount and details manually.',
          undefined,
          { duration: 3000 },
        );
        return;
      }
      this.aiConsent.grant();
    }

    this.scanningBill.set(true);

    try {
      const result = await this.billScanner.extractBill(file, undefined, {
        categories: this.relevantCategories(),
      });

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

      // Auto-match the AI-suggested category against the user's categories.
      if (result.category_name || result.category_alternatives.length > 0) {
        this.matchCategory(result.category_name, result.category_alternatives);
      }

      const statusMsg =
        result.total_amount || result.title
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

  async onVoiceRecord(): Promise<void> {
    if (this.recordingVoice()) {
      this.recordingVoice.set(false);
      try {
        const result = await this.audioCapture.stopRecording();
        await this.processVoiceAudio(result.blob);
      } catch (err: unknown) {
        this.snack.open(errorText(err, 'Failed to record audio.'), 'Dismiss', {
          duration: 4000,
        });
      }
      return;
    }

    // Consent gate: audio is sent to an external STT provider.
    if (!this.aiConsent.granted()) {
      const allowed = await openAiConsent(this.dialog);
      if (!allowed) {
        this.aiConsent.deny();
        this.snack.open(
          'No problem — enter the details manually.',
          undefined,
          { duration: 3000 },
        );
        return;
      }
      this.aiConsent.grant();
    }

    this.recordingVoice.set(true);
    this.voiceRawText.set('');
    try {
      await this.audioCapture.startRecording();
    } catch (err: unknown) {
      this.recordingVoice.set(false);
      this.snack.open(errorText(err, 'Voice input unavailable.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  private async processVoiceAudio(blob: Blob): Promise<void> {
    let transcript: string;
    try {
      transcript = await this.speechToText.transcribe(blob, { languageCode: 'en' });
    } catch (err: unknown) {
      this.snack.open(errorText(err, 'Could not transcribe audio.'), 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    if (!transcript || !transcript.trim()) {
      this.snack.open(
        'No speech detected. Please try again or enter manually.',
        undefined,
        { duration: 4000 },
      );
      return;
    }

    this.voiceRawText.set(transcript);

    let entries;
    try {
      entries = (await this.voiceParser.parse(transcript, this.relevantCategories())).entries;
    } catch (err: unknown) {
      this.snack.open(errorText(err, 'Failed to parse voice entries.'), 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    if (entries.length === 0) {
      this.snack.open(
        'No entries could be parsed from what you said.',
        undefined,
        { duration: 4000 },
      );
      return;
    }

    const ref = this.dialog.open<VoicePreviewComponent, VoicePreviewData, VoiceEntry[]>(
      VoicePreviewComponent,
      {
        data: { rawText: transcript, entries, categories: this.relevantCategories() },
      },
    );

    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed || confirmed.length === 0) return;

    await this.saveVoiceEntries(confirmed);
  }

  private async saveVoiceEntries(entries: VoiceEntry[]): Promise<void> {
    const errors: string[] = [];
    for (const entry of entries) {
      try {
        let categoryId: string | null = null;
        if (entry.category) {
          const match = this.relevantCategories().find(
            (c) => c.name.toLowerCase() === entry.category!.toLowerCase(),
          );
          if (!match) {
            const created = await this.categoriesService.create(
              entry.category,
              entry.direction === 'in' ? 'income' : 'expense',
            );
            if (created?.id) categoryId = created.id;
          } else {
            categoryId = match.id;
          }
        }

        await this.transactionsService.create({
          amount: entry.amount,
          direction: entry.direction,
          category_id: categoryId,
          notes: entry.notes,
          payment_mode: 'cash',
          bank_account_id: null,
          source: 'voice',
        });
      } catch (err: unknown) {
        errors.push(errorText(err, 'Failed to save an entry.'));
      }
    }

    this.recordingVoice.set(false);
    this.voiceRawText.set('');

    if (errors.length > 0) {
      this.snack.open(errors.join('; '), 'Dismiss', { duration: 5000 });
      return;
    }

    this.snack.open(
      `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} added.`,
      undefined,
      { duration: 2500 },
    );
    this.ref.dismiss({ saved: true });
  }

  close(): void {
    this.ref.dismiss();
  }
}
