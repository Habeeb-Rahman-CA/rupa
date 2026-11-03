import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-cards-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <nav class="cards-tabs" aria-label="Cards section">
      <a
        class="cards-tab"
        routerLink="/bank-accounts"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <span class="tab-icon"><lucide-icon name="credit-card" /></span>
        <span class="tab-copy">
          <strong>Cards</strong>
          <span>Bank accounts and cards</span>
        </span>
      </a>

      <a
        class="cards-tab"
        routerLink="/wallets"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <span class="tab-icon"><lucide-icon name="wallet" /></span>
        <span class="tab-copy">
          <strong>Wallets</strong>
          <span>Prepaid balances</span>
        </span>
      </a>
    </nav>
  `,
  styles: [
    `
      .cards-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
        margin: -4px 0 20px;
        padding: 5px;
        border: 1px solid var(--app-hairline);
        border-radius: var(--app-radius-lg);
        background: var(--app-input-bg);
      }
      .cards-tab {
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
      .cards-tab:hover { color: var(--app-ink); }
      .cards-tab.active {
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
      .cards-tab.active .tab-icon { color: var(--app-accent); }
      .tab-icon lucide-icon { width: 17px; height: 17px; }
      .tab-copy { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
      .tab-copy strong { overflow: hidden; color: inherit; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .tab-copy span { overflow: hidden; color: var(--app-ink-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      @media (max-width: 480px) {
        .cards-tabs { margin-bottom: 16px; }
        .cards-tab { justify-content: center; padding: 4px 8px; }
        .tab-copy span { display: none; }
      }
    `,
  ],
})
export class CardsTabsComponent {}
