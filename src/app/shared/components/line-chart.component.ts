import { Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Minimalist SVG line chart.
 * - Single smooth line (Catmull-Rom style curves)
 * - Faint area fill below the line
 * - Bottom axis labels only
 * - Optional highlighted point with tooltip
 *
 * Purely presentational; no clicks / no external deps.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  template: `
    @if (points().length >= 2) {
      <div class="chart">
        <svg
          [attr.viewBox]="'0 0 ' + w + ' ' + h"
          preserveAspectRatio="none"
          class="svg"
          role="img"
          [attr.aria-label]="ariaLabel()"
        >
          <defs>
            <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" [attr.stop-color]="strokeColor()" stop-opacity="0.18"/>
              <stop offset="100%" [attr.stop-color]="strokeColor()" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <path
            [attr.d]="areaPath()"
            [attr.fill]="'url(#' + gradId + ')'"
          />
          <path
            [attr.d]="linePath()"
            fill="none"
            [attr.stroke]="strokeColor()"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          @let hi = highlight();
          @if (hi != null && hi >= 0 && hi < points().length) {
            @let hx = xFor(hi);
            @let hy = yFor(points()[hi].value);
            <line
              [attr.x1]="hx"
              [attr.x2]="hx"
              y1="0"
              [attr.y2]="h - padBottom"
              stroke="var(--app-ink-subtle)"
              stroke-dasharray="3 3"
              stroke-width="1"
            />
            <circle
              [attr.cx]="hx"
              [attr.cy]="hy"
              r="5"
              fill="#fff"
              [attr.stroke]="strokeColor()"
              stroke-width="2.5"
            />
          }
        </svg>

        <!-- x-axis labels via HTML for crisper text -->
        <div class="xaxis">
          @for (p of points(); track $index) {
            <span>{{ p.label }}</span>
          }
        </div>

        @if (highlight() != null && highlight()! >= 0 && highlight()! < points().length) {
          <div
            class="tooltip"
            [style.left.%]="((highlight()!) / (points().length - 1)) * 100"
          >
            <div class="tt-val">{{ tooltipValue() }}</div>
          </div>
        }
      </div>
    } @else {
      <div class="empty">Not enough data yet.</div>
    }
  `,
  styles: [
    `
      .chart {
        position: relative;
        width: 100%;
      }
      .svg {
        display: block;
        width: 100%;
        height: 120px;
      }
      .xaxis {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        padding: 0 2px;
        font-size: 11px;
        color: var(--app-ink-muted);
        font-weight: 500;
      }
      .tooltip {
        position: absolute;
        top: -6px;
        transform: translateX(-50%);
        pointer-events: none;
      }
      .tt-val {
        background: var(--app-ink-dark);
        color: #fff;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .empty {
        color: var(--app-ink-muted);
        font-size: 13px;
        padding: 24px 0;
        text-align: center;
      }
    `,
  ],
})
export class LineChartComponent {
  readonly points = input<ChartPoint[]>([]);
  readonly highlight = input<number | null>(null);
  readonly color = input<string>('var(--app-ink-dark)');
  readonly formatter = input<(v: number) => string>((v) => String(Math.round(v)));

  // Fixed viewBox — the SVG stretches responsively
  protected readonly w = 320;
  protected readonly h = 120;
  protected readonly padTop = 12;
  protected readonly padBottom = 8;
  protected readonly padX = 6;
  protected readonly gradId = `lc-grad-${Math.random().toString(36).slice(2, 9)}`;

  strokeColor(): string {
    return this.color();
  }

  ariaLabel(): string {
    return `Line chart with ${this.points().length} points`;
  }

  private innerW(): number {
    return this.w - this.padX * 2;
  }
  private innerH(): number {
    return this.h - this.padTop - this.padBottom;
  }

  xFor(i: number): number {
    const n = this.points().length;
    if (n <= 1) return this.padX;
    return this.padX + (i / (n - 1)) * this.innerW();
  }

  yFor(v: number): number {
    const vals = this.points().map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const norm = (v - min) / range;
    return this.padTop + (1 - norm) * this.innerH();
  }

  linePath = computed(() => this.buildSmoothPath());
  areaPath = computed(() => {
    const line = this.buildSmoothPath();
    const pts = this.points();
    if (pts.length < 2) return '';
    const last = pts.length - 1;
    return `${line} L ${this.xFor(last)} ${this.h - this.padBottom} L ${this.xFor(0)} ${this.h - this.padBottom} Z`;
  });

  tooltipValue(): string {
    const i = this.highlight();
    if (i == null) return '';
    const p = this.points()[i];
    return p ? this.formatter()(p.value) : '';
  }

  private buildSmoothPath(): string {
    const pts = this.points();
    if (pts.length < 2) return '';
    const coords = pts.map((p, i) => [this.xFor(i), this.yFor(p.value)] as const);
    let d = `M ${coords[0][0]} ${coords[0][1]}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const [x0, y0] = coords[i];
      const [x1, y1] = coords[i + 1];
      // Simple horizontal bezier — smooth without overshoot
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  }
}
