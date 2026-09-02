import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="page-header">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>
      <div class="actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin: 8px 0 20px;
      }
      .titles { min-width: 0; }
      h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        color: var(--app-ink);
        letter-spacing: -0.01em;
      }
      p {
        margin: 4px 0 0;
        color: var(--app-ink-muted);
        font-size: 13px;
      }
      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
