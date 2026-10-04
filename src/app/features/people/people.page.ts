import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { TextFieldComponent } from '../../shared/components/text-field.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { PeopleService } from '../../core/services/people.service';
import { Person } from '../../core/models/domain.models';
import { PersonDialogComponent } from './person-dialog.component';
import { getAvatarColor, getInitial } from '../../shared/utils/avatar-utils';
import { errText } from '../../shared/utils/error-utils';

@Component({
  selector: 'app-people-page',
  standalone: true,
  imports: [
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    TextFieldComponent,
    SwipeableRowComponent,
  ],
  template: `
    <app-page-header
      title="People"
      subtitle="Friends and family in your money circle"
    >
      <button
        class="add-btn"
        type="button"
        (click)="openAddDialog()"
        aria-label="Add person"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (people().length === 0 && !searchQuery()) {
      <app-empty-state
        icon="users"
        title="No one added yet"
        message="Add someone before you record a loan or start a split."
      />
    } @else {
      <div class="toolbar">
        <app-text-field
          class="search-input"
          placeholder="Search people…"
          leadIcon="search"
          [value]="rawSearchQuery()"
          (valueChange)="onSearchChange($any($event))"
        />

        <button
          type="button"
          class="sort-btn"
          [class.active]="sortOrder() === 'desc'"
          (click)="toggleSort()"
          [title]="sortOrder() === 'asc' ? 'Sorted A to Z (Click to sort Z to A)' : 'Sorted Z to A (Click to sort A to Z)'"
          [attr.aria-label]="sortOrder() === 'asc' ? 'Sort descending' : 'Sort ascending'"
        >
          <lucide-icon [name]="sortOrder() === 'asc' ? 'arrow-down-a-z' : 'arrow-up-a-z'" />
        </button>
      </div>

      @if (filteredPeople().length === 0) {
        <div class="no-results">
          <lucide-icon name="search" />
          <span>No people matching "{{ searchQuery() }}"</span>
        </div>
      } @else {
        <ul class="list">
          @for (p of filteredPeople(); track p.id) {
            <app-swipeable-row (delete)="confirmRemove(p)">
              <div class="row">
                <div class="avatar" [style.background]="avatarColor(p.name)">
                  {{ initial(p.name) }}
                </div>
                <div class="mid">
                  <div class="title">{{ p.name }}</div>
                </div>
              </div>
            </app-swipeable-row>
          }
        </ul>
      }
    }
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .search-input {
        flex: 1;
        min-width: 0;
      }
      .sort-btn {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: var(--app-input-bg);
        border: 1px solid transparent;
        color: var(--app-ink);
        display: grid;
        place-items: center;
        cursor: pointer;
        flex: 0 0 auto;
        transition: background .15s ease, border-color .15s ease, color .15s ease;
      }
      .sort-btn:hover {
        background: var(--app-surface);
        border-color: var(--app-hairline);
      }
      .sort-btn.active {
        background: var(--app-accent-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
      }
      .no-results {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 32px 16px;
        color: var(--app-ink-muted);
        font-size: 14px;
      }
      .no-results lucide-icon {
        width: 18px;
        height: 18px;
      }
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
      .list {
        list-style: none;
        margin: 0 0 18px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr;
        gap: 12px;
        align-items: center;
        padding: 10px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
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
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly people = this.service.people;
  readonly submitting = signal(false);

  readonly rawSearchQuery = signal('');
  readonly searchQuery = signal('');
  readonly sortOrder = signal<'asc' | 'desc'>('asc');

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
    });
  }

  onSearchChange(val: string): void {
    const text = val ?? '';
    this.rawSearchQuery.set(text);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.searchQuery.set(text);
    }, 150);
  }

  readonly filteredPeople = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const order = this.sortOrder();
    let list = this.people();

    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      const res = a.name.localeCompare(b.name);
      return order === 'asc' ? res : -res;
    });
  });

  toggleSort(): void {
    this.sortOrder.update((curr) => (curr === 'asc' ? 'desc' : 'asc'));
  }

  openAddDialog(): void {
    this.dialog.open(PersonDialogComponent, {
      width: '400px',
    });
  }

  async confirmRemove(p: Person): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: `Delete "${p.name}"?`,
      message: 'Are you sure you want to remove this person?',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.remove(p.id);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.service.delete(id);
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Couldn’t delete — please try again.'), 'Dismiss', { duration: 4000 });
    }
  }

  readonly initial = getInitial;
  readonly avatarColor = getAvatarColor;
}
