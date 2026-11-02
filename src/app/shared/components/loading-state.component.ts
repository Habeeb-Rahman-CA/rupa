import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  template: `
    <div class="loading app-card" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ label() }}</span>
    </div>
  `,
  styles: [
    `
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 112px;
        color: var(--app-ink-muted);
        font-size: 14px;
      }
      .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid var(--app-hairline);
        border-top-color: var(--app-accent);
        border-radius: 999px;
        animation: spin .7s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `,
  ],
})
export class LoadingStateComponent {
  readonly label = input<string>('Loading…');
}
