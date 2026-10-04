import {
  Component,
  DestroyRef,
  EventEmitter,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-swipeable-row',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="swipe-container">
      <div
        class="swipe-back"
        [class.visible]="translateX() < 0"
        [style.opacity]="opacityStyle()"
        (click)="onDeleteClick($event)"
      >
        <div class="delete-action">
          <lucide-icon name="trash-2" />
          <span>Delete</span>
        </div>
      </div>
      <div
        class="swipe-front"
        [style.transform]="transformStyle()"
        [class.animating]="animating()"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        position: relative;
        margin-bottom: 8px;
      }
      :host(:last-child) {
        margin-bottom: 0;
      }
      .swipe-container {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: var(--app-radius-md, 14px);
        user-select: none;
        touch-action: pan-y;
        background: transparent;
      }
      .swipe-back {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        width: 100%;
        background: var(--app-negative);
        color: #ffffff;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding-right: 20px;
        cursor: pointer;
        z-index: 1;
        border-radius: var(--app-radius-md, 14px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.15s ease, visibility 0.15s ease;
      }
      .swipe-back.visible {
        visibility: visible;
        pointer-events: auto;
      }
      .delete-action {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
      }
      .delete-action lucide-icon {
        width: 18px;
        height: 18px;
      }
      .swipe-front {
        position: relative;
        z-index: 2;
        background: var(--app-surface);
        width: 100%;
        will-change: transform;
        border-radius: var(--app-radius-md, 14px);
      }
      .swipe-front.animating {
        transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
    `,
  ],
})
export class SwipeableRowComponent {
  @Output() delete = new EventEmitter<void>();

  private readonly destroyRef = inject(DestroyRef);

  readonly translateX = signal(0);
  readonly animating = signal(false);

  readonly opacityStyle = computed(() => {
    const x = this.translateX();
    if (x >= 0) return '0';
    return Math.min(1, Math.abs(x) / 20).toFixed(2);
  });

  private startX = 0;
  private startY = 0;
  private isDragging = false;
  private isHorizontal = false;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private hasEmittedDelete = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.clearTimer();
    });
  }

  private clearTimer(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }

  private scheduleReset(delayMs = 300): void {
    this.clearTimer();
    this.activeTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        this.reset();
      }
    }, delayMs);
  }

  private emitDeleteOnce(): void {
    if (this.hasEmittedDelete) return;
    this.hasEmittedDelete = true;
    this.delete.emit();
    this.scheduleReset(300);
  }

  transformStyle(): string {
    const x = this.translateX();
    return x === 0 ? 'translateX(0px)' : `translateX(${x}px)`;
  }

  onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, mat-menu')) return;

    this.startX = e.clientX;
    this.startY = e.clientY;
    this.isDragging = true;
    this.isHorizontal = false;
    this.animating.set(false);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (!this.isHorizontal) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        this.isHorizontal = true;
        try {
          (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
        } catch {}
      } else if (Math.abs(dy) > 8) {
        this.isDragging = false;
        this.reset();
        return;
      }
    }

    if (this.isHorizontal) {
      if (dx < 0) {
        const clamped = Math.max(-120, dx);
        this.translateX.set(clamped);
      } else {
        this.translateX.set(0);
      }
    }
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.animating.set(true);

    const currentX = this.translateX();
    if (currentX < -60) {
      this.translateX.set(-80);
      this.emitDeleteOnce();
    } else {
      this.reset();
    }
  }

  onDeleteClick(e: MouseEvent): void {
    e.stopPropagation();
    this.emitDeleteOnce();
  }

  reset(): void {
    this.clearTimer();
    if (this.isDestroyed) return;
    this.hasEmittedDelete = false;
    this.animating.set(true);
    this.translateX.set(0);
  }
}

