import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

import { CardTheme, Wallet } from '../../core/models/domain.models';
import { WalletsService } from '../../core/services/wallets.service';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errText } from '../../shared/utils/error-utils';

export interface WalletDialogData {
  wallet?: Wallet;
}

@Component({
  selector: 'app-wallet-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule, TextFieldComponent],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-icon"><lucide-icon name="wallet" /></div>
        <div>
          <h2 mat-dialog-title>{{ isEdit ? 'Edit wallet' : 'Add wallet' }}</h2>
          <p>{{ isEdit ? 'Update the wallet name or low-balance alert.' : 'Track a prepaid wallet or payment balance.' }}</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <app-text-field
          label="Wallet name"
          placeholder="e.g. Amazon Pay"
          [maxlength]="60"
          [value]="name()"
          [invalid]="touched() && !name().trim()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="save()"
          [autofocus]="true"
        />

        @if (!isEdit) {
          <app-text-field
            label="Initial balance"
            placeholder="0.00"
            type="number"
            inputmode="decimal"
            [min]="0"
            [step]="0.01"
            [value]="initialBalance()"
            (valueChange)="initialBalance.set(toNumber($event))"
          >
            <span prefix>₹</span>
          </app-text-field>
        }

        <app-text-field
          label="Low-balance alert at"
          placeholder="0.00 (optional)"
          type="number"
          inputmode="decimal"
          [min]="0"
          [step]="0.01"
          [value]="minimumBalance()"
          (valueChange)="minimumBalance.set(toNumber($event))"
          hint="You’ll see an alert when the wallet reaches this amount."
        >
          <span prefix>₹</span>
        </app-text-field>

        <div class="theme-field">
          <span class="theme-label">Card color</span>
          <div class="theme-options" role="group" aria-label="Wallet card color">
            @for (option of themeOptions; track option.value) {
              <button
                class="theme-option"
                type="button"
                [class.selected]="theme() === option.value"
                [attr.aria-label]="option.label"
                [attr.aria-pressed]="theme() === option.value"
                (click)="theme.set(option.value)"
              >
                <span class="theme-swatch" [attr.data-theme]="option.value"></span>
                <span>{{ option.label }}</span>
              </button>
            }
          </div>
        </div>

        @if (errorMessage()) {
          <div class="save-error" role="alert">{{ errorMessage() }}</div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="close()" [disabled]="submitting()">Cancel</button>
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!canSave() || submitting()">
          {{ submitting() ? 'Saving…' : (isEdit ? 'Save changes' : 'Add wallet') }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container { padding: 4px; max-width: 460px; background: var(--app-surface); color: var(--app-ink); font-family: inherit; }
      .dialog-header { display: flex; align-items: center; gap: 11px; padding: 0 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .header-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--app-accent-soft); color: var(--app-accent); font-size: 19px; }
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.2 !important; }
      .dialog-header p { margin: 4px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { display: flex; flex-direction: column; gap: 16px; min-width: 300px; padding: 18px 16px 16px !important; }
      .dialog-actions { padding: 0 16px 12px; }
      .dialog-actions button { border-radius: 999px; }
      .theme-field { display: flex; flex-direction: column; gap: 8px; }
      .theme-label { color: var(--app-ink); font-size: 13px; font-weight: 500; }
      .theme-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
      .theme-option { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; padding: 6px 3px; border: 1px solid transparent; border-radius: 11px; background: transparent; color: var(--app-ink-muted); cursor: pointer; font: inherit; font-size: 10px; }
      .theme-option:hover { background: var(--app-accent-soft); }
      .theme-option.selected { border-color: var(--app-ink); background: var(--app-accent-soft); color: var(--app-ink); font-weight: 700; }
      .theme-swatch { display: block; width: 42px; height: 25px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2), var(--app-shadow-sm); }
      .theme-swatch[data-theme='dark'] { background: linear-gradient(135deg, #25282d, #050608); }
      .theme-swatch[data-theme='blue'] { background: linear-gradient(135deg, #2563eb, #1e40af); }
      .theme-swatch[data-theme='purple'] { background: linear-gradient(135deg, #7c3aed, #4c1d95); }
      .theme-swatch[data-theme='emerald'] { background: linear-gradient(135deg, #059669, #064e3b); }
      .theme-swatch[data-theme='sunset'] { background: linear-gradient(135deg, #f97316, #c2410c); }
      .theme-swatch[data-theme='gold'] { background: linear-gradient(135deg, #d97706, #78350f); }
      .theme-swatch[data-theme='rose'] { background: linear-gradient(135deg, #e11d48, #881337); }
      .save-error { padding: 10px 12px; border-radius: 11px; background: var(--app-negative-soft); color: var(--app-negative); font-size: 12px; }
    `,
  ],
})
export class WalletDialogComponent {
  private readonly ref = inject(MatDialogRef<WalletDialogComponent>);
  private readonly data = inject<WalletDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly walletsService = inject(WalletsService);

  readonly wallet = this.data?.wallet;
  readonly isEdit = !!this.wallet;
  readonly name = signal(this.wallet?.name ?? '');
  readonly theme = signal<CardTheme>(this.wallet?.theme ?? 'dark');
  readonly initialBalance = signal<number | null>(this.wallet?.initial_balance ?? 0);
  readonly minimumBalance = signal<number | null>(this.wallet?.minimum_balance ?? 0);
  readonly submitting = signal(false);
  readonly touched = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly themeOptions: Array<{ value: CardTheme; label: string }> = [
    { value: 'dark', label: 'Midnight' },
    { value: 'blue', label: 'Ocean' },
    { value: 'purple', label: 'Violet' },
    { value: 'emerald', label: 'Emerald' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'gold', label: 'Gold' },
    { value: 'rose', label: 'Rose' },
  ];
  readonly canSave = () =>
    this.name().trim().length > 0 &&
    Number(this.initialBalance() ?? 0) >= 0 &&
    Number(this.minimumBalance() ?? 0) >= 0;

  toNumber(value: string | number | null): number | null {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async save(): Promise<void> {
    this.touched.set(true);
    this.errorMessage.set(null);
    if (!this.canSave() || this.submitting()) return;
    this.submitting.set(true);
    try {
      if (this.wallet) {
        await this.walletsService.update(this.wallet.id, {
          name: this.name(),
          theme: this.theme(),
          minimum_balance: Number(this.minimumBalance() ?? 0),
        });
      } else {
        await this.walletsService.create({
          name: this.name(),
          theme: this.theme(),
          initial_balance: Number(this.initialBalance() ?? 0),
          minimum_balance: Number(this.minimumBalance() ?? 0),
        });
      }
      this.ref.close({ saved: true });
    } catch (error: unknown) {
      this.errorMessage.set(errText(error, 'Could not save the wallet.'));
    } finally {
      this.submitting.set(false);
    }
  }

  close(): void {
    this.ref.close();
  }
}
