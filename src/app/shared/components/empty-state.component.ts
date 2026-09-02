import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="empty app-card">
      <div class="icon-wrap">
        <lucide-icon [name]="icon()" aria-hidden="true" />
      </div>
      <h2>{{ title() }}</h2>
      @if (message()) {
        <p>{{ message() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 40px 20px;
      }
      .icon-wrap {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        display: grid;
        place-items: center;
        margin-bottom: 12px;
      }
      lucide-icon {
        width: 26px;
        height: 26px;
      }
      h2 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: var(--app-ink);
      }
      p {
        margin: 0;
        max-width: 320px;
        font-size: 14px;
        color: var(--app-ink-muted);
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input<string>('Nothing here yet');
  readonly message = input<string>('');
}
