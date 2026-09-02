import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { EventsService } from '../../core/services/events.service';
import { CreateEventSheetComponent } from './create-event-sheet.component';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <app-page-header
      title="Splits"
      subtitle="Trips, dinners, anything you cover for the group"
    >
      <button
        class="add-btn"
        type="button"
        (click)="openCreate()"
        aria-label="New split"
      >
        <lucide-icon name="plus" />
      </button>
    </app-page-header>

    @if (events().length === 0) {
      <app-empty-state
        icon="split"
        title="No splits yet"
        message="Kick one off when you cover a group expense."
      />
    } @else {
      <ul class="list app-card-tight">
        @for (e of events(); track e.id; let last = $last) {
          <li [class.last]="last">
            <a class="row" [routerLink]="['/events', e.id]">
              <div class="avatar" [style.background]="colorFor(e.name)">
                <lucide-icon [name]="e.status === 'settled' ? 'check' : 'split'" />
              </div>
              <div class="mid">
                <div class="title">{{ e.name }}</div>
                <div class="sub">
                  {{ e.starts_on | date: 'MMM d, y' }}
                  @if (e.ends_on) { – {{ e.ends_on | date: 'MMM d' }} }
                </div>
              </div>
              <span class="status" [class.settled]="e.status === 'settled'">
                {{ e.status === 'settled' ? 'Settled' : 'Open' }}
              </span>
              <lucide-icon class="chevron" name="chevron-right" />
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .list { list-style: none; margin: 0; padding: 0; }
      .list li { border-bottom: 1px solid var(--app-hairline); }
      .list li.last { border-bottom: 0; }
      .row {
        display: grid;
        grid-template-columns: 40px 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 12px 12px 12px 16px;
        text-decoration: none;
        color: inherit;
      }
      .avatar {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .avatar lucide-icon { width: 22px; height: 22px; }
      .title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .status {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-weight: 600;
      }
      .status.settled {
        background: var(--app-positive-soft);
        color: var(--app-positive);
      }
      .chevron { color: var(--app-ink-subtle); }
    `,
  ],
})
export class EventsPage {
  private readonly eventsService = inject(EventsService);
  private readonly bottomSheet = inject(MatBottomSheet);

  readonly events = this.eventsService.events;

  openCreate(): void {
    this.bottomSheet.open(CreateEventSheetComponent);
  }

  colorFor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }
}
