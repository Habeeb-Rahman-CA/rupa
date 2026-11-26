import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LucideAngularModule } from 'lucide-angular';

import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { Category } from '../../core/models/domain.models';
import { VoiceEntry } from '../../core/services/voice-expense-parser.service';
import { matchCategoryName } from '../../shared/utils/category-utils';

export interface VoicePreviewData {
  rawText: string;
  entries: VoiceEntry[];
  categories: Category[];
}

const DIRECTION_OPTIONS: SelectOption<'in' | 'out'>[] = [
  { value: 'out', label: 'Expense', icon: 'minus' },
  { value: 'in', label: 'Income', icon: 'plus' },
];

/**
 * Dialog follows the app's standard dialog recipe (budget/profile/interest):
 * icon-tile header with hairline divider, 16px padded content column, global
 * `.form-grid` for field alignment, and pill actions right-aligned below.
 */
@Component({
  selector: 'app-voice-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormsModule,
    LucideAngularModule,
    TextFieldComponent,
    SelectFieldComponent,
    SignedMoneyPipe,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-text">
          <h2 mat-dialog-title>Voice entries</h2>
          <p class="dialog-subtitle">Review each entry before saving</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="field-group">
          <app-text-field
            label="Transcribed text"
            placeholder="Edit what was heard if needed"
            [value]="rawText()"
            (valueChange)="rawText.set($any($event))"
          />
        </div>

        @if (error(); as err) {
          <div class="error-notice" role="alert">
            <lucide-icon name="alert-circle" />
            <span>{{ err }}</span>
          </div>
        }

        <div class="entries-block">
          <div class="entries-head">
            <span class="micro-label">Entries</span>
            <span class="entries-total">
              {{ totalOut() | signedMoney:'out' }} spent • {{ totalIn() | signedMoney:'in' }} income
            </span>
          </div>

          @if (entries().length === 0) {
            <p class="empty-hint">No entries parsed yet. Try speaking again.</p>
          }

          @for (entry of entries(); track entryIdx(entry, $index); let i = $index) {
            <div class="entry-card">
              <div class="entry-head">
                <span class="micro-label">Entry {{ i + 1 }}</span>
                <button
                  type="button"
                  class="remove-btn"
                  title="Remove entry"
                  [attr.aria-label]="'Remove entry ' + (i + 1)"
                  (click)="removeEntry(i)"
                >
                  <lucide-icon name="trash-2" />
                </button>
              </div>

              <div class="form-grid">
                <app-text-field
                  label="Amount"
                  type="number"
                  inputmode="decimal"
                  [min]="0"
                  [step]="0.01"
                  [value]="entryAmount(i)"
                  (valueChange)="setAmount(i, $event)"
                  ><span prefix>₹</span></app-text-field
                >

                <app-select-field
                  label="Type"
                  [options]="directionOptions()"
                  [value]="selectedDirection(i)"
                  (valueChange)="setDirection(i, $event)"
                />

                <app-select-field
                  class="full"
                  label="Category"
                  [options]="categoryOptions()"
                  [value]="selectedCategory(i)"
                  (valueChange)="setCategory(i, $event)"
                />

                <app-text-field
                  class="full"
                  label="Note (optional)"
                  placeholder="e.g. Rashif bill share"
                  [value]="entry.notes ?? ''"
                  (valueChange)="setNotes(i, $event)"
                />
              </div>
            </div>
          }

          <button type="button" class="add-entry-btn" (click)="addEntry()">
            <lucide-icon name="plus" />
            <span>Add entry</span>
          </button>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" class="cancel-btn" (click)="close()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="busy() || entries().length === 0 || !valid()"
          (click)="confirm()"
        >
          @if (busy()) {
            <mat-spinner diameter="16" class="btn-spinner" />
          } @else {
            <lucide-icon name="check" />
          }
          <span>Add {{ entries().length }} entr{{ entries().length === 1 ? 'y' : 'ies' }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        min-width: min(340px, 100%);
        max-width: 480px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header — the app's standard dialog header (icon tile + title row). */
      .dialog-header {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 4px 16px 14px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .header-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .header-icon lucide-icon {
        width: 19px;
        height: 19px;
      }
      .header-text {
        min-width: 0;
      }
      h2 {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        color: var(--app-ink) !important;
      }
      .dialog-subtitle {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px !important;
      }

      /* Entries list — one card per parsed row; fields align on the same
         global 2-column grid every other form dialog uses. */
      .entries-block {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .entries-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px 8px;
      }
      .entries-total {
        color: var(--app-ink-muted);
        font-size: 11.5px;
        font-weight: 500;
      }
      .entry-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-md);
        background: var(--app-surface);
      }
      .entry-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 28px;
      }
      .remove-btn {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        border: none;
        background: transparent;
        color: var(--app-ink-muted);
        cursor: pointer;
        border-radius: 8px;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }
      .remove-btn:hover {
        background: var(--app-negative-soft);
        color: var(--app-negative);
      }
      .remove-btn lucide-icon {
        width: 15px;
        height: 15px;
      }
      .full {
        grid-column: 1 / -1;
      }
      .empty-hint {
        margin: 0;
        color: var(--app-ink-muted);
        font-size: 12.5px;
        text-align: center;
      }
      .add-entry-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 100%;
        padding: 11px 14px;
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-sm);
        background: var(--app-surface);
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }
      .add-entry-btn:hover {
        background: var(--app-accent-soft);
        border-color: var(--app-accent);
      }
      .add-entry-btn lucide-icon {
        width: 15px;
        height: 15px;
      }

      .error-notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--app-negative-soft);
        color: var(--app-negative);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.35;
      }
      .error-notice lucide-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .dialog-actions {
        padding: 16px 12px;
        gap: 8px;
      }
      .dialog-actions button {
        border-radius: 999px;
      }
      .cancel-btn {
        color: var(--app-ink-muted) !important;
      }
      .btn-spinner {
        display: inline-block;
        margin-right: 8px;
      }

      /* Finger-sized targets on touch devices (the PWA case). */
      @media (pointer: coarse) {
        .remove-btn {
          width: 40px;
          height: 40px;
        }
        .add-entry-btn {
          min-height: 46px;
        }
      }
      /* Narrow phones: keep the dialog inside the viewport and let the two
         half-width fields (Amount / Type) stay side by side. */
      @media (max-width: 480px) {
        .dialog-container {
          min-width: 0;
          max-width: 100%;
        }
      }
    `,
  ],
})
export class VoicePreviewComponent {
  readonly ref = inject<MatDialogRef<VoicePreviewComponent, VoiceEntry[] | null>>(
    MatDialogRef,
  );
  readonly data = inject<VoicePreviewData>(MAT_DIALOG_DATA);

  readonly rawText = signal(this.data.rawText);
  // Parsed entries carry a category *name* (or null). Resolve it once here the
  // way the bill scanner matches a suggestion: exact, then whole-word against
  // the user's categories — so a spoken "food" lands on "Food & Dining" and
  // the select below shows a selection instead of staying blank.
  readonly entries = signal<VoiceEntry[]>(this.normalizeCategories(this.data.entries));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly DIRECTION_OPTIONS = DIRECTION_OPTIONS;

  readonly directionOptions = () => DIRECTION_OPTIONS;

  /**
   * Options are keyed by category *name* — the same identity VoiceEntry uses
   * (and the same one saveVoiceEntries matches on). Suggestions that match no
   * existing category are appended as "+ name" so the row still shows what the
   * model heard instead of a blank select; confirming creates them, exactly
   * like the bill scanner's "+ New category" pre-fill.
   */
  readonly categoryOptions = computed<SelectOption[]>(() => {
    const known = this.data.categories.map((c) => ({
      value: c.name,
      label: c.name,
      icon: 'tag',
    }));
    const knownKeys = new Set(known.map((o) => o.value.toLowerCase()));

    const unmatched: string[] = [];
    for (const entry of this.entries()) {
      const name = entry.category?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!knownKeys.has(key) && !unmatched.some((u) => u.toLowerCase() === key)) {
        unmatched.push(name);
      }
    }

    return [
      { value: '', label: 'Uncategorized', icon: 'tag' },
      ...known,
      ...unmatched.map((name) => ({ value: name, label: `+ ${name}`, icon: 'tag' })),
    ];
  });

  entryIdx = (_entry: VoiceEntry, index: number) => index;

  entryAmount(index: number): string {
    return String(this.entries()[index]?.amount ?? '');
  }

  setAmount(index: number, value: string | number | null): void {
    const entries = this.entries();
    const parsed = value != null ? Number(String(value).replace(/[^0-9.]/g, '')) : null;
    entries[index] = {
      ...entries[index],
      amount: parsed ?? entries[index].amount,
    };
    this.entries.set([...entries]);
  }

  setDirection(index: number, value: string | null): void {
    const entries = this.entries();
    entries[index] = { ...entries[index], direction: value === 'in' ? 'in' : 'out' };
    this.entries.set([...entries]);
  }

  selectedDirection(index: number): 'in' | 'out' | null {
    return this.entries()[index]?.direction ?? null;
  }

  selectedCategory(index: number): string | null {
    const entry = this.entries()[index];
    const name = entry?.category?.trim();
    if (!name) return null;
    // The select matches on option *value* (now the category name), so return
    // that canonical value rather than a label — this lookup used to compare a
    // name against id-keyed options and always fell through, which is why a
    // mapped category still rendered as blank.
    const opt = this.categoryOptions().find(
      (o) => o.value !== '' && o.value.toLowerCase() === name.toLowerCase(),
    );
    return opt ? opt.value : name;
  }

  /** Exact-then-whole-word resolution of every entry's suggested category. */
  private normalizeCategories(entries: VoiceEntry[]): VoiceEntry[] {
    return entries.map((entry) => ({
      ...entry,
      category: this.resolveCategory(entry.category),
    }));
  }

  private resolveCategory(suggested: string | null): string | null {
    const name = suggested?.trim();
    if (!name) return null;
    // Unmatched suggestions are kept verbatim so they show up as a "+ name"
    // option; saving then creates them, like the bill scanner's new-category
    // pre-fill.
    return matchCategoryName(name, this.data.categories) ?? name;
  }

  setCategory(index: number, value: string | null): void {
    const entries = this.entries();
    entries[index] = { ...entries[index], category: value || null };
    this.entries.set([...entries]);
  }

  setNotes(index: number, value: string | number | null): void {
    const entries = this.entries();
    const str = value == null ? null : String(value).trim();
    entries[index] = { ...entries[index], notes: str || null };
    this.entries.set([...entries]);
  }

  addEntry(): void {
    this.entries.set([...this.entries(), { amount: 0, direction: 'out', category: null, notes: null }]);
  }

  removeEntry(index: number): void {
    const entries = this.entries();
    entries.splice(index, 1);
    this.entries.set([...entries]);
  }

  readonly totalOut = computed(() =>
    this.entries().reduce((sum, e) => (e.direction === 'out' ? sum + e.amount : sum), 0),
  );
  readonly totalIn = computed(() =>
    this.entries().reduce((sum, e) => (e.direction === 'in' ? sum + e.amount : sum), 0),
  );

  readonly valid = computed(() =>
    this.entries().every((e) => e.amount > 0),
  );

  close(): void {
    this.ref.close(null);
  }

  async confirm(): Promise<void> {
    if (this.busy() || !this.valid()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const entries = this.entries().filter((e) => e.amount > 0);
      if (entries.length === 0) {
        this.error.set('Add at least one valid entry with an amount greater than zero.');
        return;
      }
      this.ref.close(entries);
    } finally {
      this.busy.set(false);
    }
  }
}
