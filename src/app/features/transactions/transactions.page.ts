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
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { BankAccount, Category, Transaction, isSavingsCategory } from '../../core/models/domain.models';
import { getCategoryColor, getCategoryIcon } from '../../shared/utils/category-utils';
import { errText } from '../../shared/utils/error-utils';

export interface EnrichedTransaction extends Transaction {
  label: string;
  subText: string;
  icon: string;
  color: string;
  isSavings: boolean;
}

export interface DayGroup {
  date: string;
  items: EnrichedTransaction[];
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
                  <div class="tx-icon" [style.background]="t.color">
                    <lucide-icon [name]="t.icon" />
                  </div>
                  <div class="tx-mid">
                    <div class="tx-title">{{ t.label }}</div>
                    @if (t.subText) {
                      <div class="tx-sub">{{ t.subText }}</div>
                    }
                  </div>
                  <div
                    class="tx-amount"
                    [class.money-negative]="t.direction === 'out' && !t.isSavings"
                    [class.money-savings]="t.isSavings"
                    [class.money-positive]="t.direction === 'in' && !t.isSavings"
                  >
                    {{ t.amount | signedMoney: (t.isSavings ? 'out' : t.direction) }}
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
  private readonly bankAccountsService = inject(BankAccountsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly categoryMap = computed(() => {
    const map = new Map<string, Category>();
    for (const c of this.categoriesService.categories()) {
      map.set(c.id, c);
    }
    return map;
  });

  readonly bankAccountMap = computed(() => {
    const map = new Map<string, BankAccount>();
    for (const b of this.bankAccountsService.bankAccounts()) {
      map.set(b.id, b);
    }
    return map;
  });

  readonly groups = computed<DayGroup[]>(() => {
    const list = this.service.transactions();
    const catMap = this.categoryMap();
    const bankMap = this.bankAccountMap();

    const groupMap = new Map<string, DayGroup>();

    for (const t of list) {
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const isSavings = isSavingsCategory(cat);
      const label = cat?.name ?? (t.direction === 'in' ? 'Income' : 'Expense');

      let bankName = '';
      if (t.payment_mode === 'cash') bankName = 'Cash';
      else if (t.payment_mode === 'bank') {
        const acc = t.bank_account_id ? bankMap.get(t.bank_account_id) : undefined;
        bankName = acc?.bank_name ?? 'Bank';
      }

      const parts: string[] = [];
      if (t.notes) parts.push(t.notes);
      if (bankName) parts.push(bankName);
      const subText = parts.join(' • ');

      const icon = isSavings ? 'piggy-bank' : getCategoryIcon(label);
      const color = isSavings ? '#0ea5e9' : getCategoryColor(label);

      const enriched: EnrichedTransaction = {
        ...t,
        label,
        subText,
        icon,
        color,
        isSavings,
      };

      const key = t.occurred_on;
      let group = groupMap.get(key);
      if (!group) {
        group = { date: key, items: [], dayTotal: 0 };
        groupMap.set(key, group);
      }
      group.items.push(enriched);
      const amt = Number(t.amount);
      group.dayTotal += t.direction === 'in' ? amt : -amt;
    }

    return Array.from(groupMap.values());
  });

  async confirmRemove(t: EnrichedTransaction): Promise<void> {
    const ok = await openConfirm(this.dialog, {
      title: 'Delete transaction?',
      message: `Are you sure you want to delete ${t.label} entry of ₹${t.amount}?`,
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
