import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { InterestEntry } from '../../core/models/domain.models';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { InterestService, RecordInterestDisposalInput } from '../../core/services/interest.service';
import { DateFieldComponent } from '../../shared/components/date-field.component';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';
import { isGreaterCurrency, roundCurrency } from '../../shared/utils/currency-utils';

export interface RecordDisposalDialogData {
  /** Pre-select the entry this disposal covers (when opened from an entry card). */
  entry?: InterestEntry;
}

@Component({
  selector: 'app-record-disposal-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    LucideAngularModule,
    DateFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div>
          <h2 mat-dialog-title>Record Disposal</h2>
          <p class="dialog-subtitle">
            Interest given away — recorded separately from personal expenses.
          </p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <div class="form-grid">
          @if (entryOptions().length > 1) {
            <div class="full">
              <app-select-field
                label="Interest entry"
                placeholder="Select the interest being disposed"
                [options]="entryOptions()"
                [value]="entryId()"
                [invalid]="touched() && !entryId()"
                (valueChange)="entryId.set($any($event) || null)"
              />
            </div>
          } @else {
            <div class="full entry-chip">
              <lucide-icon name="percent" />
              <span>{{ entryLabel(entryId()) }}</span>
            </div>
          }

          <app-text-field
            label="Amount"
            placeholder="0.00"
            type="number"
            inputmode="decimal"
            [min]="0"
            [max]="remaining()"
            [step]="0.01"
            leadIcon="gift"
            [value]="amount()"
            [invalid]="touched() && !amountValid()"
            [hint]="remainingHint()"
            (valueChange)="amount.set(toNumber($event))"
            [autofocus]="true"
          ><span prefix>₹</span></app-text-field>

          <app-date-field
            label="Date"
            placeholder="When it was given"
            [value]="occurredOn()"
            [invalid]="touched() && !occurredOn()"
            (valueChange)="occurredOn.set($event)"
          />

          <app-text-field
            class="full"
            label="Note (optional)"
            placeholder="e.g. who it was given for, what it was used for"
            leadIcon="sticky-note"
            [maxlength]="120"
            [value]="notes()"
            (valueChange)="notes.set($any($event) ?? '')"
          />

          <div class="full hint">
            <lucide-icon name="shield-check" />
            <span>
              A disposal is money given away — it is never counted as a personal expense
              and will not appear in expenses or reports.
            </span>
          </div>

          @if (touched() && overRemaining()) {
            <div class="full error-notice">
              <lucide-icon name="alert-circle" />
              <span>Amount cannot exceed the remaining interest of ₹{{ remaining().toFixed(2) }}.</span>
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
          {{ submitting() ? 'Saving…' : 'Record Disposal' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
      .dialog-container { max-width: 520px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { max-height: 75vh; padding: 16px !important; }
      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
      .full { grid-column: 1 / -1; }
      .entry-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 12px;
        border: 1px solid var(--app-hairline);
        border-radius: 13px;
        background: var(--app-input-bg);
        color: var(--app-ink);
        font-size: 13px;
        font-weight: 600;
      }
      .entry-chip lucide-icon { width: 16px; height: 16px; color: var(--app-accent); }
      .hint, .error-notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .hint lucide-icon, .error-notice lucide-icon { width: 16px; height: 16px; flex: 0 0 auto; color: var(--app-accent); }
      .error-notice { background: var(--app-negative-soft, rgba(239, 68, 68, .1)); color: var(--app-negative); }
      .error-notice lucide-icon { color: var(--app-negative); }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
      @media (max-width: 540px) { .form-grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class RecordDisposalDialogComponent {
  private readonly ref = inject(MatDialogRef<RecordDisposalDialogComponent>);
  private readonly data = inject<RecordDisposalDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly interestService = inject(InterestService);
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly snack = inject(MatSnackBar);

  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly entryId = signal<string | null>(this.initialEntryId());
  readonly amount = signal<number | null>(
    this.remainingFor(this.entryId()),
  );
  readonly occurredOn = signal<Date | null>(new Date());
  readonly notes = signal('');

  /** Entries that still have interest left to dispose. */
  readonly entryOptions = computed<SelectOption<string>[]>(() =>
    this.interestService
      .entries()
      .filter((entry) => this.interestService.remainingForEntry(entry) > 0)
      .map((entry) => ({
        value: entry.id,
        label: this.entryLabel(entry.id),
        icon: 'percent',
      })),
  );

  readonly remaining = computed(() => {
    const entry = this.entry();
    if (!entry) return 0;
    return roundCurrency(this.interestService.remainingForEntry(entry));
  });

  readonly overRemaining = computed(() => {
    const amount = this.amount();
    if (!amount || !this.entryId()) return false;
    return isGreaterCurrency(roundCurrency(amount), this.remaining());
  });

  remainingHint(): string | undefined {
    const entry = this.entry();
    if (!entry) return undefined;
    return `Remaining interest: ₹${this.remaining().toFixed(2)}`;
  }

  amountValid(): boolean {
    const value = this.amount();
    return !!value && value > 0 && !this.overRemaining();
  }

  canSave(): boolean {
    return !!this.entryId() && this.amountValid() && !!this.occurredOn();
  }

  toNumber(value: string | number | null): number | null {
    return value === '' || value == null ? null : Number(value);
  }

  entryLabel(entryId: string | null): string {
    const entry = this.interestService.entries().find((item) => item.id === entryId);
    if (!entry) return 'Interest entry';
    const account = this.bankAccountsService
      .bankAccounts()
      .find((item) => item.id === entry.bank_account_id);
    const bank = account ? `${account.bank_name}` : 'Bank';
    const [year, month, day] = entry.occurred_on.split('-').map(Number);
    const on = new Date(year, month - 1, day);
    const dateLabel = `${on.toLocaleString('en', { month: 'short' })} ${on.getDate()}, ${on.getFullYear()}`;
    const remaining = this.interestService.remainingForEntry(entry);
    return `${bank} · ${dateLabel} · ₹${Number(entry.amount).toFixed(2)} (₹${remaining.toFixed(2)} left)`;
  }

  async save(): Promise<void> {
    this.touched.set(true);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);

    try {
      const input: RecordInterestDisposalInput = {
        entry_id: this.entryId()!,
        amount: Number(this.amount()),
        occurred_on: toIsoDate(this.occurredOn()!)!,
        notes: this.notes().trim() || null,
      };
      await this.interestService.recordDisposal(input);
      this.snack.open('Disposal recorded.', undefined, { duration: 2000 });
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.snack.open(errorText(error, 'Couldn’t save the disposal record.'), 'Dismiss', {
        duration: 4000,
      });
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }

  private entry(): InterestEntry | undefined {
    const id = this.entryId();
    if (!id) return undefined;
    return this.interestService.entries().find((item) => item.id === id);
  }

  private initialEntryId(): string | null {
    if (this.data.entry) return this.data.entry.id;
    // Opened without a pre-selected entry: pick it when exactly one is pending.
    const open = this.interestService
      .entries()
      .filter((entry) => this.interestService.remainingForEntry(entry) > 0);
    return open.length === 1 ? open[0].id : null;
  }

  private remainingFor(entryId: string | null): number | null {
    const entry = this.interestService.entries().find((item) => item.id === entryId);
    return entry ? roundCurrency(this.interestService.remainingForEntry(entry)) : null;
  }
}

function toIsoDate(value: Date | null): string | null {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}
