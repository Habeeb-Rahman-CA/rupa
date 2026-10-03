import { afterNextRender, Component, DestroyRef, inject } from '@angular/core';
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
    this.destroyRef.onDestroy(() => {
      if (this.timer1 !== null) window.clearTimeout(this.timer1);
      if (this.timer2 !== null) window.clearTimeout(this.timer2);
    });

    // Hide the boot splash once Angular has painted its first frame.
    afterNextRender(() => this.hideSplash());
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
