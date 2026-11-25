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

export interface VoicePreviewData {
  rawText: string;
  entries: VoiceEntry[];
  categories: Category[];
}

const DIRECTION_OPTIONS: SelectOption<'in' | 'out'>[] = [
  { value: 'out', label: 'Expense', icon: 'minus' },
  { value: 'in', label: 'Income', icon: 'plus' },
];

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
    <div class="preview-container">
      <header class="preview-header">
        <div class="header-icon">
          <lucide-icon name="mic" />
        </div>
        <div class="header-text">
          <h2 mat-dialog-title>Voice entries</h2>
          <p class="preview-subtitle">Review each entry before saving</p>
        </div>
      </header>

      <mat-dialog-content class="preview-content">
          <app-text-field
            label="Transcribed text"
            placeholder="Edit what was heard if needed"
            [value]="rawText()"
            (valueChange)="rawText.set($any($event))"
          />

        @if (error(); as err) {
          <div class="error-notice" role="alert">
            <lucide-icon name="alert-circle" />
            <span>{{ err }}</span>
          </div>
        }

        <div class="entries-list">
          <h3 class="entries-title">
            Entries ({{ entries().length }})
            <span class="entries-total">
              {{ totalOut() | signedMoney:'out' }} spent • {{ totalIn() | signedMoney:'in' }} income
            </span>
          </h3>

          @for (entry of entries(); track entryIdx(entry, $index); let i = $index) {
            <div class="entry-row">
              <div class="entry-handle">
                <lucide-icon name="grip-vertical" />
              </div>

              <app-text-field
                class="f-amount"
                label="Amount"
                type="number"
                inputmode="decimal"
                [min]="0"
                [step]="0.01"
                [value]="entryAmount(i)"
                (valueChange)="setAmount(i, $event)"
              />
              <span class="entry-currency">₹</span>

              <app-select-field
                class="f-type"
                label="Type"
                [options]="directionOptions()"
                [value]="selectedDirection(i)"
                (valueChange)="setDirection(i, $event)"
              />

              <app-select-field
                class="f-category"
                label="Category"
                [options]="categoryOptions()"
                [value]="selectedCategory(i)"
                (valueChange)="setCategory(i, $event)"
              />

              <!-- Note + remove share their own full-width line so the
                   delete button stays pinned to the right edge instead of
                   being orphaned on a line of its own. -->
              <div class="entry-footer">
                <app-text-field
                  class="f-note"
                  label="Note (optional)"
                  [placeholder]="'e.g. Rashif bill share'"
                  [value]="entry.notes ?? ''"
                  (valueChange)="setNotes(i, $event)"
                />
                <button
                  type="button"
                  class="remove-btn"
                  title="Remove entry"
                  (click)="removeEntry(i)"
                >
                  <lucide-icon name="trash-2" />
                </button>
              </div>
            </div>
          }

          <button
            type="button"
            class="add-entry-btn"
            (click)="addEntry()"
          >
            <lucide-icon name="plus" />
            <span>Add entry</span>
          </button>

          @if (entries().length === 0) {
            <p class="empty-hint">No entries parsed yet. Try speaking again.</p>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="preview-actions">
        <button mat-button type="button" (click)="close()">Cancel</button>
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
      .preview-container {
        max-width: 460px;
        padding: 0;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }
      .preview-header {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 14px 16px;
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
        font-size: 18px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        color: var(--app-ink) !important;
      }
      .preview-subtitle {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .preview-content {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px !important;
      }
      .entry-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
        padding: 10px 0;
        border-bottom: 1px solid var(--app-hairline);
        min-width: 0;
      }
      .entry-row:last-child {
        border-bottom: none;
      }
      /* Wrapped layout for narrow (PWA) screens: amount + type share the
         first line, category joins when there is room (otherwise it takes
         its own line), and note + remove always get the last full line.
         min-width: 0 lets the fields shrink below their content so the row
         never overflows horizontally. */
      .f-amount {
        flex: 1 1 100px;
        min-width: 0;
      }
      .f-type {
        flex: 1 1 100px;
        min-width: 0;
      }
      .f-category {
        flex: 1 1 120px;
        min-width: 0;
      }
      .entry-footer {
        display: flex;
        align-items: center;
        gap: 9px;
        flex: 1 1 100%;
        min-width: 0;
      }
      .f-note {
        flex: 1 1 auto;
        min-width: 0;
      }
      .entry-handle {
        display: grid;
        place-items: center;
        width: 24px;
        flex: 0 0 auto;
        color: var(--app-ink-muted);
      }
      .entry-handle lucide-icon {
        width: 14px;
        height: 14px;
      }
      .entry-currency {
        flex: 0 0 auto;
        color: var(--app-ink-muted);
        font-size: 13px;
        font-weight: 600;
        margin-top: 2px;
      }
      .remove-btn {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border: none;
        background: transparent;
        color: var(--app-negative);
        cursor: pointer;
        border-radius: 8px;
      }
      .remove-btn:hover {
        background: var(--app-negative-soft);
      }
      .remove-btn lucide-icon {
        width: 16px;
        height: 16px;
      }
      .add-entry-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px dashed var(--app-hairline);
        border-radius: 10px;
        background: transparent;
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 8px 12px;
        margin-top: 6px;
      }
      .add-entry-btn:hover {
        background: var(--app-accent-soft);
      }
      .add-entry-btn lucide-icon {
        width: 14px;
        height: 14px;
      }
      .entries-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .entries-title {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--app-ink);
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: baseline;
        gap: 4px 8px;
      }
      .entries-total {
        font-size: 11px;
        font-weight: 500;
        color: var(--app-ink-muted);
        white-space: nowrap;
      }
      .empty-hint {
        margin: 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        text-align: center;
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
      .preview-actions {
        padding: 12px 16px;
        gap: 8px;
        flex-wrap: wrap;
      }
      .preview-actions button {
        border-radius: 999px;
        /* Share the row equally, or stack full-width when even two
           buttons cannot sit side by side on a narrow screen. */
        flex: 1 1 130px;
      }
      .btn-spinner {
        display: inline-block;
        margin-right: 8px;
      }
      /* Finger-sized targets on touch devices (the PWA case). */
      @media (pointer: coarse) {
        .remove-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
        }
        .add-entry-btn {
          min-height: 44px;
          padding: 10px 16px;
        }
        .preview-actions button {
          min-height: 44px;
        }
      }
      /* Mobile (PWA): full-width dialog, stacked fields on narrow screens. */
      @media (max-width: 640px) {
        .preview-container {
          max-width: 100%;
          width: 100%;
        }
        .preview-header {
          padding: 12px 16px;
        }
        .preview-content {
          padding: 12px !important;
        }
        .f-amount,
        .f-type,
        .f-category {
          flex: 1 1 100%;
          width: 100%;
        }
        .entry-footer {
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
        }
        .f-note {
          width: 100%;
        }
        .remove-btn {
          align-self: flex-end;
          width: 44px;
          height: 44px;
          border-radius: 12px;
        }
        .add-entry-btn {
          width: 100%;
          justify-content: center;
          min-height: 48px;
        }
        .preview-actions {
          flex-direction: column;
          gap: 8px;
        }
        .preview-actions button {
          flex: 1 1 100%;
          min-height: 48px;
        }
        .entries-total {
          white-space: normal;
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
  readonly entries = signal<VoiceEntry[]>([...this.data.entries]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly DIRECTION_OPTIONS = DIRECTION_OPTIONS;

  readonly directionOptions = () => DIRECTION_OPTIONS;

  readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Uncategorized', icon: 'tag' },
    ...this.data.categories.map((c) => ({
      value: c.id,
      label: c.name,
      icon: 'tag',
    })),
  ]);

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
    if (!entry?.category) return null;
    const opt = this.categoryOptions().find((o) => o.label === entry.category);
    return opt ? opt.label : entry.category;
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
