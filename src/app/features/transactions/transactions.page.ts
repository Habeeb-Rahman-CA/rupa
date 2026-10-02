import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SwipeableRowComponent } from '../../shared/components/swipeable-row.component';
import { openConfirm } from '../../shared/components/confirm-dialog.component';
import { SignedMoneyPipe } from '../../shared/pipes/signed-money.pipe';
import { TransactionsService } from '../../core/services/transactions.service';
import { CategoriesService } from '../../core/services/categories.service';
import { Transaction, isSavingsCategory } from '../../core/models/domain.models';

interface DayGroup {
  date: string;
  items: Transaction[];
  dayTotal: number;
}

@Component({
  selector: 'app-transactions-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    LucideAngularModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SwipeableRowComponent,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header
      title="Transactions"
      subtitle="Every entry, newest first"
    />

    @if (groups().length === 0) {
      <app-empty-state
        icon="receipt"
        title="No transactions yet"
        message="Tap the + button to add your first one."
      />
    } @else {
      @for (g of groups(); track g.date) {
        <section class="day">
          <div class="day-head">
            <span class="day-date">{{ g.date | date: 'EEE, MMM d' }}</span>
            <span
              class="day-total"
              [class.money-negative]="g.dayTotal < 0"
              [class.money-positive]="g.dayTotal > 0"
            >
              {{ g.dayTotal | signedMoney }}
            </span>
          </div>

          <ul class="tx-list">
            @for (t of g.items; track t.id) {
              <app-swipeable-row (delete)="confirmRemove(t)">
                <div class="tx-row">
                  <div class="tx-icon" [style.background]="tileColor(t)">
                    <lucide-icon [name]="iconFor(t)" />
                  </div>
                  <div class="tx-mid">
                    <div class="tx-title">{{ labelFor(t) }}</div>
                    @if (t.notes) {
                      <div class="tx-sub">{{ t.notes }}</div>
                    }
                  </div>
                  <div
                    class="tx-amount"
                    [class.money-negative]="t.direction === 'out' && !isSavingsTx(t)"
                    [class.money-savings]="isSavingsTx(t)"
                    [class.money-positive]="t.direction === 'in' && !isSavingsTx(t)"
                  >
                    {{ t.amount | signedMoney: (isSavingsTx(t) ? 'out' : t.direction) }}
                  </div>
                </div>
              </app-swipeable-row>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: [
    `
      .day { margin-bottom: 20px; }
      .day-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 4px 8px;
      }
      .day-date {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-ink-muted);
      }
      .day-total {
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .tx-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .tx-row {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        background: var(--app-surface);
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-hairline);
        box-shadow: var(--app-shadow-sm);
      }
      .tx-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
      }
      .tx-icon lucide-icon {
        width: 22px;
        height: 22px;
      }
      .tx-title { font-size: 14px; font-weight: 600; color: var(--app-ink); }
      .tx-sub { font-size: 12px; color: var(--app-ink-muted); margin-top: 2px; }
      .tx-amount {
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class TransactionsPage {
  private readonly service = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly groups = computed<DayGroup[]>(() => {
    const list = this.service.transactions();
    const map = new Map<string, DayGroup>();
    for (const t of list) {
      const key = t.occurred_on;
      let group = map.get(key);
      if (!group) {
        group = { date: key, items: [], dayTotal: 0 };
        map.set(key, group);
      }
      group.items.push(t);
      const amt = Number(t.amount);
      group.dayTotal += t.direction === 'in' ? amt : -amt;
    }
    return Array.from(map.values());
  });

  isSavingsTx(t: Transaction): boolean {
    const cat = this.categoriesService.categories().find((c) => c.id === t.category_id);
    return isSavingsCategory(cat);
  }

  labelFor(t: Transaction): string {
    return (
      this.categoriesService.categories().find((c) => c.id === t.category_id)?.name ??
      (t.direction === 'in' ? 'Income' : 'Expense')
    );
  }

  iconFor(t: Transaction | string): string {
    const name = typeof t === 'string' ? t : this.labelFor(t);
    if (typeof t !== 'string' && this.isSavingsTx(t)) return 'piggy-bank';
    const key = name.toLowerCase();
    if (key.includes('food') || key.includes('groc')) return 'utensils-crossed';
    if (key.includes('fuel') || key.includes('petrol') || key.includes('transport')) return 'fuel';
    if (key.includes('rent') || key.includes('home')) return 'home';
    if (key.includes('salary')) return 'briefcase';
    if (key.includes('pf') || key.includes('invest') || key.includes('savin') || key.includes('fund') || key.includes('gold') || key.includes('fd') || key.includes('sip')) return 'piggy-bank';
    if (key.includes('bill') || key.includes('util')) return 'receipt';
    if (key.includes('shop')) return 'shopping-bag';
    if (key.includes('travel') || key.includes('trip')) return 'plane';
    if (key.includes('health') || key.includes('med')) return 'stethoscope';
    if (key.includes('income')) return 'trending-up';
    return 'wallet';
  }

  tileColor(t: Transaction | string): string {
    if (typeof t !== 'string' && this.isSavingsTx(t)) return '#0ea5e9';
    const name = typeof t === 'string' ? t : this.labelFor(t);
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#10b981','#14b8a6','#0ea5e9','#ec4899','#475569'];
    return palette[Math.abs(hash) % palette.length];
  }

  async confirmRemove(t: Transaction): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete transaction?',
      message: `Are you sure you want to delete ${this.labelFor(t)} entry of ₹${t.amount}?`,
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'trash-2',
    });
    if (ok) {
      await this.remove(t);
    }
  }

  async remove(t: Transaction): Promise<void> {
    try {
      await this.service.delete(t.id);
      this.snack.open('Deleted.', undefined, { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open(errText(e, 'Could not delete.'), 'Dismiss', { duration: 4000 });
    }
  }
}

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}
