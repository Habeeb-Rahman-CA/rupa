import { afterNextRender, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`:host { display: block; height: 100%; }`],
})
export class App {
  constructor() {
    // Hide the boot splash once Angular has painted its first frame.
    afterNextRender(() => this.hideSplash());
  }

  private hideSplash(): void {
    const splash = document.getElementById('app-splash');
    if (!splash) return;
    // Small minimum hold so the logo has time to breathe on fast networks.
    const hold = 900;
    window.setTimeout(() => {
      splash.classList.add('splash-hidden');
      // Remove from DOM after the fade completes so it can't intercept clicks.
      window.setTimeout(() => splash.remove(), 400);
    }, hold);
  }
}
