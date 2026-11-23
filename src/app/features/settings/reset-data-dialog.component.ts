import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { ResetDataService, ResetGroupId } from '../../core/services/reset-data.service';
import { AuthService } from '../../core/services/auth.service';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { errorText } from '../../shared/utils/error-utils';

type Stage = 'select' | 'password' | 'confirm';

/**
 * Settings → "Reset user data" flow.
 *
 * Stages:
 *   select   : pick which data groups to wipe (linked groups get pre-checked
 *              and locked) plus optional device-local data.
 *   password : verify the account password via signInWithPassword — the only
 *              password check Supabase exposes to clients.
 *   confirm  : type RESET, then run the wipe RPC, clear device data and
 *              reload the app so every service starts from a clean state.
 *
 * Nothing is deleted before the final stage; the dialog is never closeable
 * by backdrop click while a stage with input is active (disableClose).
 */
@Component({
  selector: 'app-reset-data-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    LucideAngularModule,
    TextFieldComponent,
  ],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-text">
          <h2 mat-dialog-title>{{ title() }}</h2>
          <p class="dialog-subtitle">{{ subtitle() }}</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        @if (error(); as err) {
          <div class="error-notice" role="alert">
            <lucide-icon name="alert-circle" />
            <span>{{ err }}</span>
          </div>
        }

        @if (stage() === 'select') {
          <div class="select-toolbar">
            <span class="select-count">{{ selectionCount() }}</span>
            <button type="button" class="link-btn" (click)="toggleAll()">
              {{ allSelected() ? 'Clear all' : 'Select all' }}
            </button>
          </div>

          <ul class="group-list">
            @for (group of reset.groups; track group.id) {
              <li class="group-row">
                <div class="group-text">
                  <span class="group-name">
                    {{ group.label }}
                    @if (isForced(group.id)) {
                      <span class="linked-chip">linked</span>
                    }
                  </span>
                  <span class="group-desc">{{ group.hint }}</span>
                </div>
                <mat-checkbox
                  color="primary"
                  [checked]="isChecked(group.id)"
                  [disabled]="isForced(group.id)"
                  (change)="toggle(group.id, $event.checked)"
                  [attr.aria-label]="group.label"
                />
              </li>
            }
            <li class="group-row">
              <div class="group-text">
                <span class="group-name">Device data</span>
                <span class="group-desc"
                  >App lock (MPIN), theme and local preferences on this device.</span
                >
              </div>
              <mat-checkbox
                color="primary"
                [checked]="device()"
                (change)="device.set($event.checked)"
                aria-label="Device data"
              />
            </li>
          </ul>

          <p class="hint">
            Linked groups are required by the selection and are removed together with it — they’re
            checked for you. Your account and sign-in are not affected.
          </p>
        }

        @if (stage() === 'password') {
          <p class="hint strong">
            Deleting is permanent. Confirm it’s you by entering the account password for
            {{ email() }}.
          </p>
          <app-text-field
            label="Account password"
            type="password"
            placeholder="Your password"
            leadIcon="key-round"
            autocomplete="current-password"
            [value]="password()"
            (valueChange)="password.set($any($event) ?? '')"
            (enter)="verify()"
            [autofocus]="true"
          />
        }

        @if (stage() === 'confirm') {
          <div class="summary">
            <p class="summary-title">This will permanently delete:</p>
            <ul class="summary-list">
              @for (label of summaryLabels(); track label) {
                <li>
                  <lucide-icon name="trash-2" />
                  <span>{{ label }}</span>
                </li>
              }
            </ul>
          </div>

          <app-text-field
            label="Type RESET to confirm"
            placeholder="RESET"
            leadIcon="alert-circle"
            [value]="confirmText()"
            (valueChange)="confirmText.set($any($event) ?? '')"
            (enter)="execute()"
          />
          <p class="hint">This can’t be undone. Recovery is not possible after deletion.</p>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" class="cancel-btn" [disabled]="busy()" (click)="back()">
          {{ stage() === 'select' ? 'Cancel' : 'Back' }}
        </button>

        @if (stage() === 'select') {
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!canContinue()"
            (click)="goToPassword()"
          >
            Continue
          </button>
        } @else if (stage() === 'password') {
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="busy() || !password()"
            (click)="verify()"
          >
            @if (busy()) {
              Checking…
            } @else {
              Verify
            }
          </button>
        } @else {
          <button
            mat-flat-button
            class="danger-flat"
            type="button"
            [disabled]="busy() || !canExecute()"
            (click)="execute()"
          >
            @if (busy()) {
              Deleting…
            } @else {
              Delete selected data
            }
          </button>
        }
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        min-width: 320px;
        max-width: 400px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

      /* Header — same structure as the other app dialogs */
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
      .header-icon.destructive {
        background: var(--app-negative-soft);
        color: var(--app-negative);
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
        gap: 14px;
        min-width: 320px;
        max-height: 60vh;
        padding: 16px !important;
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

      /* ---- select stage ---- */
      .select-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .select-count {
        color: var(--app-ink-muted);
        font-size: 12px;
        font-weight: 600;
      }
      /* Same plain accent link-button as interest/pay-debt dialogs. */
      .link-btn {
        border: 0;
        background: transparent;
        padding: 0;
        color: var(--app-accent);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .link-btn:hover {
        text-decoration: underline;
      }

      .group-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border-top: 1px solid var(--app-hairline);
      }
      .group-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 2px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .group-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .group-name {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--app-ink);
        font-size: 13.5px;
        font-weight: 600;
      }
      .group-desc {
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .linked-chip {
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      /* ---- password / confirm stages ---- */
      .hint {
        margin: 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .hint.strong {
        color: var(--app-ink);
        font-weight: 500;
      }

      .summary {
        padding: 12px;
        border-radius: 12px;
        background: var(--app-negative-soft);
      }
      .summary-title {
        margin: 0 0 8px;
        color: var(--app-negative);
        font-size: 12.5px;
        font-weight: 700;
      }
      .summary-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .summary-list li {
        display: flex;
        align-items: center;
        gap: 7px;
        color: var(--app-ink);
        font-size: 12.5px;
        font-weight: 600;
      }
      .summary-list lucide-icon {
        width: 13px;
        height: 13px;
        flex: 0 0 auto;
        color: var(--app-negative);
      }

      .dialog-actions {
        padding: 0 16px 12px;
      }
      .dialog-actions button {
        border-radius: 999px;
      }
      .dialog-actions .cancel-btn {
        color: var(--app-ink-muted) !important;
      }
      .dialog-actions .danger-flat {
        background: var(--app-negative, #dc2626) !important;
        color: #fff !important;
      }
    `,
  ],
})
export class ResetDataDialogComponent {
  readonly ref = inject<MatDialogRef<ResetDataDialogComponent, boolean>>(MatDialogRef);

  readonly reset = inject(ResetDataService);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly stage = signal<Stage>('select');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Raw user picks — forced ("linked") groups are not stored here. */
  readonly base = signal<Set<ResetGroupId>>(new Set());
  readonly device = signal(false);
  readonly password = signal('');
  readonly confirmText = signal('');

  readonly email = computed(() => this.auth.user()?.email ?? 'your account');
  readonly effective = computed(() => this.reset.expandSelection(this.base()));

  readonly allGroupIds: readonly ResetGroupId[] = this.reset.groups.map((g) => g.id);
  readonly allSelected = computed(() => this.allGroupIds.every((id) => this.base().has(id)));

  readonly selectionCount = computed(() => {
    const db = this.effective().size;
    const parts: string[] = [];
    parts.push(`${db} data group${db === 1 ? '' : 's'}`);
    if (this.device()) parts.push('device data');
    return parts.join(' + ');
  });

  readonly canContinue = computed(() => this.base().size > 0 || this.device());
  readonly canExecute = computed(() => this.confirmText().trim() === 'RESET' && this.canContinue());

  readonly title = computed(() => {
    switch (this.stage()) {
      case 'select':
        return 'Reset user data';
      case 'password':
        return 'Confirm your password';
      case 'confirm':
        return 'Delete permanently?';
    }
  });

  readonly subtitle = computed(() => {
    switch (this.stage()) {
      case 'select':
        return 'Choose what to delete. Nothing is removed until you confirm.';
      case 'password':
        return 'This proves it’s you before anything is deleted.';
      case 'confirm':
        return 'Last step — this cannot be undone.';
    }
  });

  readonly summaryLabels = computed<string[]>(() => {
    const labels = this.reset.groups.filter((g) => this.effective().has(g.id)).map((g) => g.label);
    if (this.device()) labels.push('Device data (this device)');
    return labels;
  });

  // ------------------------------------------------------------- select

  isChecked(id: ResetGroupId): boolean {
    return this.effective().has(id);
  }

  isForced(id: ResetGroupId): boolean {
    return this.reset.isForced(this.base(), id);
  }

  toggle(id: ResetGroupId, checked: boolean): void {
    if (this.isForced(id)) return;
    this.base.update((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    this.error.set(null);
  }

  toggleAll(): void {
    this.base.set(this.allSelected() ? new Set() : new Set(this.allGroupIds));
    this.error.set(null);
  }

  goToPassword(): void {
    if (!this.canContinue()) return;
    this.error.set(null);
    this.password.set('');
    this.stage.set('password');
  }

  // ----------------------------------------------------------- password

  async verify(): Promise<void> {
    if (this.busy() || !this.password()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.reset.verifyPassword(this.password());
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error ?? 'Couldn’t verify your password.');
      this.password.set('');
      return;
    }
    this.password.set('');
    this.stage.set('confirm');
  }

  // ------------------------------------------------------------ confirm

  async execute(): Promise<void> {
    if (this.busy() || !this.canExecute()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const groups = [...this.effective()];
      if (groups.length > 0) {
        await this.reset.resetGroups(groups);
      }
      if (this.device()) {
        this.reset.clearDeviceData();
      }
      this.snackBar.open('Your data has been reset.', undefined, { duration: 2500 });
      this.ref.close(true);
      // Full reload so every service, cache and signal starts clean.
      setTimeout(() => window.location.reload(), 1400);
    } catch (err: unknown) {
      this.error.set(errorText(err, 'Couldn’t reset your data.'));
      this.busy.set(false);
    }
    // `busy` stays true on success — the reload is imminent.
  }

  back(): void {
    if (this.busy()) return;
    this.error.set(null);
    if (this.stage() === 'select') {
      this.ref.close(false);
      return;
    }
    if (this.stage() === 'confirm') {
      this.stage.set('password');
      return;
    }
    this.password.set('');
    this.stage.set('select');
  }
}
