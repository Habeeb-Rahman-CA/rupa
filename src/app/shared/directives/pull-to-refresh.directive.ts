import {
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
  inject,
  input,
} from '@angular/core';

/**
 * Swipe-down pull-to-refresh for any scroll container.
 *
 * Behavior:
 *  - Only activates when the container is scrolled to the top.
 *  - Waits until the user has clearly pulled DOWN (12px commit threshold)
 *    before intercepting the touch — normal scrolling and short vertical
 *    swipes keep working unaffected.
 *  - Past ~70px, releasing calls onRefresh() and turns the indicator into
 *    a spinner until the returned Promise resolves.
 *  - Below threshold, snaps back.
 */
@Directive({
  selector: '[appPullToRefresh]',
  standalone: true,
})
export class PullToRefreshDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);

  readonly onRefresh = input<() => Promise<unknown> | unknown>();

  private indicator!: HTMLElement;
  private startY = 0;
  private pullDistance = 0;

  /** True from touchstart until touchend, if the touch started at scrollTop=0. */
  private trackingTouch = false;
  /** True only once we've committed to pull mode (past commitThreshold). */
  private isPulling = false;
  private isRefreshing = false;

  private readonly commitThreshold = 12; // px of downward pull before we take over
  private readonly triggerAt = 70;       // px of visual pull to trigger refresh
  private readonly maxPull = 130;        // visual cap
  private readonly slowdown = 0.55;      // rubber-band resistance

  constructor() {
    queueMicrotask(() => this.init());
  }

  private init(): void {
    const el = this.host.nativeElement;

    this.renderer.setStyle(el, 'overscroll-behavior-y', 'contain');
    this.renderer.setStyle(el, 'position', 'relative');

    this.indicator = this.renderer.createElement('div');
    this.renderer.setAttribute(this.indicator, 'class', 'ptr-indicator');
    this.renderer.setProperty(this.indicator, 'innerHTML', ICON_SVG);
    this.renderer.insertBefore(el, this.indicator, el.firstChild);

    if (!document.getElementById('ptr-styles')) {
      const style = this.renderer.createElement('style');
      this.renderer.setAttribute(style, 'id', 'ptr-styles');
      this.renderer.setProperty(style, 'textContent', STYLES);
      this.renderer.appendChild(document.head, style);
    }

    const onStart = (e: TouchEvent) => this.onTouchStart(e);
    const onMove = (e: TouchEvent) => this.onTouchMove(e);
    const onEnd = () => this.onTouchEnd();

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });

    this.destroyRef.onDestroy(() => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    });
  }

  private onTouchStart(e: TouchEvent): void {
    if (this.isRefreshing) return;
    if (e.touches.length !== 1) return;
    // Only arm if we start at the top; if scrolled, ignore this touch entirely.
    if (this.host.nativeElement.scrollTop > 0) {
      this.trackingTouch = false;
      return;
    }
    this.startY = e.touches[0].clientY;
    this.trackingTouch = true;
    this.isPulling = false;
    this.pullDistance = 0;
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.isRefreshing) return;
    if (!this.trackingTouch) return;

    // If the browser managed to scroll away from the top mid-touch (rare with
    // our commit threshold, but possible on kinetic devices), release.
    if (!this.isPulling && this.host.nativeElement.scrollTop > 0) {
      this.trackingTouch = false;
      return;
    }

    const dy = e.touches[0].clientY - this.startY;

    // NOT yet committed — give the browser a chance to handle normal scroll.
    if (!this.isPulling) {
      if (dy < this.commitThreshold) {
        // Either not enough pull yet, or user is scrolling upward.
        // Don't preventDefault — browser handles it.
        return;
      }
      // Cross the threshold going down → commit to pull mode.
      this.isPulling = true;
    }

    // Committed to pull mode from here on.
    if (dy <= 0) {
      // User reversed direction; snap back and release.
      this.isPulling = false;
      this.trackingTouch = false;
      this.snapBack();
      return;
    }

    e.preventDefault();
    this.pullDistance = Math.min(this.maxPull, dy * this.slowdown);
    this.updateIndicator();
  }

  private async onTouchEnd(): Promise<void> {
    if (!this.trackingTouch) return;
    this.trackingTouch = false;

    if (!this.isPulling) return;
    this.isPulling = false;

    const cb = this.onRefresh();
    if (this.pullDistance >= this.triggerAt && cb) {
      this.isRefreshing = true;
      this.setRefreshing(true);
      try {
        await cb();
      } catch (err) {
        console.error('Pull-to-refresh handler failed', err);
      } finally {
        this.isRefreshing = false;
        this.setRefreshing(false);
        this.snapBack();
      }
    } else {
      this.snapBack();
    }
  }

  private updateIndicator(): void {
    const progress = Math.min(1, this.pullDistance / this.triggerAt);
    const translateY = this.pullDistance - 44;
    const scale = 0.6 + 0.4 * progress;
    const rotate = progress * 180;

    this.indicator.style.transition = 'none';
    this.indicator.style.opacity = String(progress);
    this.indicator.style.transform =
      `translateX(-50%) translateY(${translateY}px) scale(${scale})`;
    const inner = this.indicator.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = `rotate(${rotate}deg)`;
  }

  private snapBack(): void {
    this.pullDistance = 0;
    this.indicator.style.transition = 'transform .25s ease, opacity .25s ease';
    this.indicator.style.transform =
      'translateX(-50%) translateY(-44px) scale(0.6)';
    this.indicator.style.opacity = '0';
    const inner = this.indicator.firstElementChild as HTMLElement | null;
    if (inner) {
      inner.style.transition = 'transform .25s ease';
      inner.style.transform = 'rotate(0deg)';
    }
  }

  private setRefreshing(on: boolean): void {
    if (on) {
      this.indicator.classList.add('spinning');
      this.indicator.style.transition = 'transform .18s ease, opacity .18s ease';
      this.indicator.style.transform =
        `translateX(-50%) translateY(${this.triggerAt - 44}px) scale(1)`;
      this.indicator.style.opacity = '1';
    } else {
      this.indicator.classList.remove('spinning');
    }
  }
}

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
  stroke-linejoin="round">
  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
  <path d="M21 3v5h-5"/>
  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
  <path d="M8 16H3v5"/>
</svg>
`;

const STYLES = `
.ptr-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  width: 36px;
  height: 36px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--app-surface, #ffffff);
  color: var(--app-ink, #0b0d10);
  display: grid;
  place-items: center;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  transform: translateX(-50%) translateY(-44px) scale(0.6);
  box-shadow: 0 4px 14px rgba(15, 17, 20, 0.10),
              0 1px 2px rgba(15, 17, 20, 0.06);
  border: 1px solid rgba(15, 17, 20, 0.05);
}
.ptr-indicator > svg {
  transition: transform .15s ease;
}
.ptr-indicator.spinning > svg {
  animation: ptr-spin 0.75s linear infinite;
}
@keyframes ptr-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;
