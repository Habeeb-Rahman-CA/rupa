import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-cards-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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

      <a
        class="cards-tab"
        routerLink="/subscriptions"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <span class="tab-icon"><lucide-icon name="repeat" /></span>
        <span class="tab-copy">
          <strong>Subs</strong>
          <span>Recurring plans</span>
        </span>
      </a>
    </nav>
  `,
  styles: [
    `
      .cards-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
        transition:
          background 0.18s ease,
          box-shadow 0.18s ease,
          color 0.18s ease;
      }
      .cards-tab:hover {
        color: var(--app-ink);
      }
      .cards-tab.active {
        background: var(--app-surface);
        box-shadow: var(--app-shadow-sm);
        color: var(--app-ink);
      }
      .cards-tab.active .tab-icon {
        color: var(--app-accent);
      }
      @media (max-width: 480px) {
        .cards-tabs {
          margin-bottom: 16px;
        }
        .cards-tab {
          justify-content: center;
          padding: 4px 8px;
        }
        .tab-copy span {
          display: none;
        }
      }
    `,
  ],
})
export class CardsTabsComponent {}
