import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Tab strip for the Manage Data section (Categories / People).
 * Follows the same convention as CardsTabsComponent: one tab per route,
 * rendered directly under the page header on each page of the section.
 */
@Component({
  selector: 'app-manage-data-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <nav class="section-tabs" aria-label="Manage data section">
      <a
        class="section-tab"
        routerLink="/categories"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <span class="tab-icon"><lucide-icon name="tags" /></span>
        <span class="tab-copy">
          <strong>Categories</strong>
          <span>Income &amp; expense groups</span>
        </span>
      </a>

      <a
        class="section-tab"
        routerLink="/people"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <span class="tab-icon"><lucide-icon name="users" /></span>
        <span class="tab-copy">
          <strong>People</strong>
          <span>Friends &amp; family</span>
        </span>
      </a>
    </nav>
  `,
  styles: [
    `
      .section-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
        margin: -4px 0 20px;
        padding: 5px;
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-lg);
        background: var(--app-input-bg);
      }
      .section-tab {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: calc(var(--app-radius-lg) - 4px);
        color: var(--app-ink-muted);
        text-decoration: none;
        transition: background .18s ease, box-shadow .18s ease, color .18s ease;
      }
      .section-tab:hover { color: var(--app-ink); }
      .section-tab.active {
        background: var(--app-surface);
        box-shadow: var(--app-shadow-sm);
        color: var(--app-ink);
      }
      .tab-icon {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border-radius: 10px;
        color: var(--app-ink-muted);
      }
      .section-tab.active .tab-icon { color: var(--app-accent); }
      .tab-icon lucide-icon { width: 17px; height: 17px; }
      .tab-copy { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
      .tab-copy strong { overflow: hidden; color: inherit; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .tab-copy span { overflow: hidden; color: var(--app-ink-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      @media (max-width: 480px) {
        .section-tabs { margin-bottom: 16px; }
        .section-tab { justify-content: center; padding: 4px 8px; }
        .tab-copy span { display: none; }
      }
    `,
  ],
})
export class ManageDataTabsComponent {}
