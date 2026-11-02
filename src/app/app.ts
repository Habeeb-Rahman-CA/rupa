import { afterNextRender, Component, DestroyRef, inject, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`:host { display: block; height: 100%; }`],
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private timer1: number | null = null;
  private timer2: number | null = null;

  constructor() {
    if (isDevMode()) {
      void this.removeStaleDevelopmentServiceWorkers();
    }

    this.destroyRef.onDestroy(() => {
      if (this.timer1 !== null) window.clearTimeout(this.timer1);
      if (this.timer2 !== null) window.clearTimeout(this.timer2);
    });

    // Hide the boot splash once Angular has painted its first frame.
    afterNextRender(() => this.hideSplash());
  }

  private async removeStaleDevelopmentServiceWorkers(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const localRegistrations = registrations.filter((registration) =>
        registration.scope.startsWith(window.location.origin),
      );
      const hadController = !!navigator.serviceWorker.controller && localRegistrations.length > 0;
      await Promise.all(localRegistrations.map((registration) => registration.unregister()));

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      const reloadKey = 'rupa_dev_service_worker_removed';
      if (hadController && sessionStorage.getItem(reloadKey) !== 'true') {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      } else if (!hadController) {
        sessionStorage.removeItem(reloadKey);
      }
    } catch {
      // Development cleanup is best-effort and should never block app startup.
    }
  }

  private hideSplash(): void {
    const splash = document.getElementById('app-splash');
    if (!splash) return;
    // Small minimum hold so the logo has time to breathe on fast networks.
    const hold = 900;
    this.timer1 = window.setTimeout(() => {
      if (splash.parentNode) {
        splash.classList.add('splash-hidden');
      }
      // Remove from DOM after the fade completes so it can't intercept clicks.
      this.timer2 = window.setTimeout(() => {
        if (splash.parentNode) {
          splash.remove();
        }
      }, 400);
    }, hold);
  }
}
