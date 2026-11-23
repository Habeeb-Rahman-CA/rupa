import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { errorText } from '../../shared/utils/error-utils';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';
import { TextFieldComponent } from '../../shared/components/text-field.component';

export interface ProfileDialogData {
  name: string;
  email: string;
  avatarColor: string;
}

export type AvatarStyle = 'initials' | 'color';

@Component({
  selector: 'app-profile-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule, TextFieldComponent],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-text">
          <h2 mat-dialog-title>Edit profile</h2>
          <p class="dialog-subtitle">Update your display name and avatar colour.</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        @if (error(); as err) {
          <div class="error-notice" role="alert">
            <lucide-icon name="alert-circle" />
            <span>{{ err }}</span>
          </div>
        }

        <div class="field-group">
          <app-text-field
            label="Display name"
            placeholder="Your name"
            leadIcon="user"
            [maxlength]="60"
            [value]="name()"
            (valueChange)="name.set($any($event) ?? '')"
            (enter)="save()"
            [autofocus]="true"
          />
          <p class="hint">Shown across the app and in notifications.</p>
        </div>

        <div class="field-group">
          <label class="ft-label">Avatar colour</label>
          <div class="color-grid">
            @for (color of avatarColors; track color) {
              <button
                type="button"
                class="color-swatch"
                [class.selected]="avatarColor() === color"
                [style.background]="color"
                (click)="avatarColor.set(color)"
                [attr.aria-label]="'Colour ' + color"
              ></button>
            }
          </div>
          <p class="hint">Applied to your avatar circle.</p>
        </div>

        <div class="avatar-preview">
          <div class="avatar-circle" [style.background]="avatarColor()">
            {{ initials() }}
          </div>
          <p class="preview-label">Preview</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button
          mat-button
          type="button"
          [disabled]="busy()"
          (click)="ref.close(false)"
          class="cancel-btn"
        >
          Cancel
        </button>
        <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="save()">
          {{ busy() ? 'Saving…' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 4px;
        min-width: 340px;
        max-width: 420px;
        background: var(--app-surface);
        color: var(--app-ink);
        font-family: inherit;
      }

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
        min-width: 300px;
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
      .ft-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-ink);
        margin-bottom: 6px;
      }
      .name-field {
        width: 100%;
      }
      .hint {
        margin: 8px 0 0;
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .color-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 8px;
        width: 100%;
      }
      .color-swatch {
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        padding: 0;
        outline: 2px solid transparent;
        outline-offset: 2px;
        transition: transform 0.1s;
      }
      .color-swatch.selected {
        outline-color: var(--app-accent);
        transform: scale(1.12);
      }
      .color-swatch:active {
        transform: scale(0.95);
      }

      .avatar-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding-top: 4px;
      }
      .avatar-circle {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: #fff;
        font-size: 24px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }
      .preview-label {
        margin: 0;
        color: var(--app-ink-muted);
        font-size: 12px;
      }

      .dialog-actions {
        padding: 0 16px 12px;
        gap: 8px;
      }
      .dialog-actions button {
        border-radius: 999px;
      }
      .dialog-actions .cancel-btn {
        color: var(--app-ink-muted) !important;
      }
    `,
  ],
})
export class ProfileDialogComponent {
  readonly ref = inject<MatDialogRef<ProfileDialogComponent, boolean>>(MatDialogRef);
  readonly data = inject<ProfileDialogData>(MAT_DIALOG_DATA);

  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly name = signal(this.data.name);
  readonly avatarColor = signal(this.data.avatarColor);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly avatarColors = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#ec4899'];

  readonly initials = computed(() => getInitial(this.name()));

  async save(): Promise<void> {
    if (this.busy()) return;
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.error.set('Please enter a name.');
      return;
    }
    if (trimmed.length > 60) {
      this.error.set('Name is too long (max 60 characters).');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const { error } = await this.auth.updateProfile({
        displayName: trimmed,
        avatarColor: this.avatarColor(),
      });
      if (error) {
        this.error.set(errorText(error, 'Couldn’t save profile.'));
        return;
      }
      this.snackBar.open('Profile updated.', undefined, { duration: 2500 });
      this.ref.close(true);
    } catch (err: unknown) {
      this.error.set(errorText(err, 'Couldn’t save profile.'));
    } finally {
      this.busy.set(false);
    }
  }
}
