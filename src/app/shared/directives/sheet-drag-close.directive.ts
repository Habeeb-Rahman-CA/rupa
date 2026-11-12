import { Directive, ElementRef, inject } from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';

/**
 * Drag-to-close for bottom sheets.
 *
 * Usage: add `<div appSheetDragClose></div>` as the first child of a
 * bottom-sheet component's root element. The directive supplies the
 * `.sheet-handle` class (styled in styles.scss — the rounded bar at the top of
 * every sheet) and makes it actually draggable:
 *
 *  - dragging down follows the finger (the whole overlay pane moves),
 *  - released past ~90px — or on a quick downward flick — the sheet dismisses,
 *  - released earlier, it springs back.
 *
 * The decorative `::before` bar on the container is suppressed via `:has()`
 * whenever a real handle is present, so the visual is unchanged.
 *
 * The drag transform is applied to the overlay pane rather than the container
 * because the container runs a CSS enter animation with `fill: forwards`,
 * which would override an inline transform.
 */
@Directive({
  selector: '[appSheetDragClose]',
  standalone: true,
  host: {
    class: 'sheet-handle',
    'aria-hidden': 'true',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
  },
})
export class SheetDragCloseDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ref = inject(MatBottomSheetRef, { optional: true });

  /** Released past this distance → close. */
  private readonly closeAt = 90;
  /** …or past this distance with a quick downward flick (px/ms). */
  private readonly flickAt = 30;
  private readonly flickVelocity = 0.6;

  private activePointerId: number | null = null;
  private pane: HTMLElement | null = null;
  private startY = 0;
  private startedAt = 0;
  private distance = 0;

  onPointerDown(event: PointerEvent): void {
    if (!this.ref || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const container = this.host.nativeElement.closest('.mat-bottom-sheet-container');
    if (!container) return;

    this.pane =
      (this.host.nativeElement.closest('.cdk-overlay-pane') as HTMLElement | null) ??
      (container as HTMLElement);
    this.startY = event.clientY;
    this.startedAt = event.timeStamp;
    this.distance = 0;
    this.activePointerId = event.pointerId;

    try {
      this.host.nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a best-effort enhancement.
    }
    this.pane.style.transition = 'none';
  }

  onPointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId || !this.pane) return;
    const distance = Math.max(0, event.clientY - this.startY);
    this.distance = distance;
    if (distance > 0) event.preventDefault();
    this.pane.style.transform = distance > 0 ? `translateY(${distance}px)` : '';
  }

  onPointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;

    const pane = this.pane;
    const distance = this.distance;
    const elapsed = Math.max(1, event.timeStamp - this.startedAt);
    const velocity = distance / elapsed;
    this.activePointerId = null;
    this.pane = null;

    if (this.host.nativeElement.hasPointerCapture?.(event.pointerId)) {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    }
    if (!pane || !this.ref) return;

    const shouldClose =
      distance >= this.closeAt || (distance >= this.flickAt && velocity > this.flickVelocity);

    if (shouldClose) {
      pane.style.transition = '';
      pane.style.transform = '';
      this.ref.dismiss();
      return;
    }

    pane.style.transition = 'transform .18s cubic-bezier(.4, 0, .2, 1)';
    pane.style.transform = '';
    const cleanup = (): void => {
      pane.style.transition = '';
      pane.removeEventListener('transitionend', cleanup);
    };
    pane.addEventListener('transitionend', cleanup);
  }
}
