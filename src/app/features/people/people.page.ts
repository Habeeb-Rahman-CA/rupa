import { Component, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { PeopleService } from '../../core/services/people.service';

@Component({
  selector: 'app-people-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatMenuModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    TextFieldComponent,
  ],
  template: `
    <app-page-header
      title="People"
      subtitle="Friends and family in your money circle"
    />

    <section class="add-card app-card">
      <div class="add-form">
        <app-text-field
          class="name"
          label="Add person"
          placeholder="e.g. Ahmed"
          [maxlength]="60"
          [value]="name()"
          (valueChange)="name.set($any($event) ?? '')"
          (enter)="add()"
        />
        <button
          class="add-btn"
          type="button"
          (click)="add()"
          [disabled]="!name().trim() || submitting()"
          aria-label="Add person"
        >
          <lucide-icon name="plus" />
        </button>
      </div>
    </section>

    @if (people().length === 0) {
      <app-empty-state
        icon="users"
        title="No one added yet"
        message="Add someone before you record a loan or start a split."
      />
    } @else {
      <ul class="list app-card-tight">
        @for (p of people(); track p.id; let last = $last) {
          <li class="row" [class.last]="last">
            <div class="avatar" [style.background]="avatarColor(p.name)">
              {{ initial(p.name) }}
            </div>
            <div class="mid">
              <div class="title">{{ p.name }}</div>
            </div>
            <button mat-icon-button [matMenuTriggerFor]="menu">
              <lucide-icon name="more-vertical" />
            </button>
            <mat-menu #menu="matMenu">
              <button mat-menu-item (click)="remove(p.id)">
                <lucide-icon name="trash-2" />
                <span>Delete</span>
              </button>
            </mat-menu>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .add-card {
        margin-bottom: 20px;
        padding: 16px;
      }
      .add-form {
        display: flex;
        gap: 12px;
        align-items: flex-end;
      }
      .name { flex: 1; min-width: 0; }
      .list { list-style: none; margin: 0; padding: 0; }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px 6px 10px 16px;
        border-bottom: 1px solid var(--app-hairline);
      }
      .row.last { border-bottom: 0; }
      .avatar {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 700;
        font-size: 15px;
      }
      .title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
    `,
  ],
})
export class PeoplePage {
  private readonly service = inject(PeopleService);
  private readonly snack = inject(MatSnackBar);

  readonly people = this.service.people;
  readonly submitting = signal(false);
  readonly name = signal('');

  async add(): Promise<void> {
    const val = this.name().trim();
    if (!val || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.service.create(val);
      this.name.set('');
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t add — please try again.'), 'Dismiss', { duration: 4000 });
    } finally {
      this.submitting.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.service.delete(id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t delete — please try again.'), 'Dismiss', { duration: 4000 });
    }
  }

  initial(n: string): string {
    return (n.trim()[0] ?? '?').toUpperCase();
  }

  avatarColor(n: string): string {
    let hash = 0;
    for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }
}

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
