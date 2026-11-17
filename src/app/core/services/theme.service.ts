import { Injectable, effect, inject, signal } from '@angular/core';

const THEME_KEY = 'rupa:theme';

type Theme = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storedTheme = signal<Theme>('system');

  readonly theme = this.storedTheme.asReadonly();
  readonly isDark = signal(false);

  constructor() {
    // Load saved preference on init.
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        this.storedTheme.set(saved);
      }
    }

    // Apply theme whenever preference changes.
    effect(() => {
      const t = this.storedTheme();
      this.applyTheme(t);
    });
  }

  /** Toggle between light → dark → system → light. */
  toggle(): void {
    const next: Theme =
      this.storedTheme() === 'light' ? 'dark' : this.storedTheme() === 'dark' ? 'system' : 'light';
    this.storedTheme.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, next);
    }
  }

  setTheme(theme: Theme): void {
    this.storedTheme.set(theme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, theme);
    }
  }

  private applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    let resolved: 'light' | 'dark';

    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      resolved = theme;
    }

    this.isDark.set(resolved === 'dark');

    // Apply both the CSS attribute and the color-scheme meta.
    html.setAttribute('data-theme', resolved);
    html.style.colorScheme = resolved;

    // Update the theme-color meta tag for browser chrome.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#0b0d10' : '#f5f6f8');
    }

    // Listen for system preference changes when in system mode.
    if (theme === 'system') {
      this.watchSystemPreference();
    }
  }

  private watchSystemPreference(): void {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (this.storedTheme() === 'system') {
        this.applyTheme('system');
      }
    };
    mq.addEventListener('change', handler);
  }
}
