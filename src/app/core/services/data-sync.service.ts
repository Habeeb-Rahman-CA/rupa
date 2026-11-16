import { Injectable, effect, inject, Injector } from '@angular/core';
import { AuthService } from './auth.service';
import { CategoriesService } from './categories.service';
import { PeopleService } from './people.service';
import { TransactionsService } from './transactions.service';
import { DebtsService } from './debts.service';
import { MoneyHeldService } from './money-held.service';
import { TransfersService } from './transfers.service';
import { WalletsService } from './wallets.service';

import { BankAccountsService } from './bank-accounts.service';
import { SubscriptionsService } from './subscriptions.service';
import { InterestService } from './interest.service';
import { BudgetsService } from './budgets.service';
import { PushService } from './push.service';
import { OfflineQueueService } from './offline-queue.service';

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly offlineQueue = inject(OfflineQueueService);

  private syncPromise: Promise<void> | null = null;

  constructor() {
    // Whenever user is authenticated, trigger orchestrated 2-phase data load.
    // Services are injected lazily inside syncAll() so they are not all
    // instantiated at app boot — only when sync actually runs.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.syncAll();
      }
    });
  }

  /**
   * Coordinated 2-phase data synchronization:
   * Phase 1: Load lookup data (Categories, People & Bank Accounts) first
   * Phase 2: Load dependent financial records (Transactions, Debts)
   */
  async syncAll(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    if (this.syncPromise) return this.syncPromise;

    // Lazily inject services so they are not instantiated until sync runs.
    const categoriesService = this.injector.get(CategoriesService);
    const peopleService = this.injector.get(PeopleService);
    const bankAccountsService = this.injector.get(BankAccountsService);
    const transactionsService = this.injector.get(TransactionsService);
    const debtsService = this.injector.get(DebtsService);
    const moneyHeldService = this.injector.get(MoneyHeldService);
    const transfersService = this.injector.get(TransfersService);
    const walletsService = this.injector.get(WalletsService);
    const subscriptionsService = this.injector.get(SubscriptionsService);
    const interestService = this.injector.get(InterestService);
    const budgetsService = this.injector.get(BudgetsService);
    const pushService = this.injector.get(PushService);

    this.syncPromise = (async () => {
      try {
        // Phase 1: Master lookups
        await Promise.all([
          categoriesService.load(),
          peopleService.load(),
          bankAccountsService.load(),
        ]);

        // Phase 2: Relational ledger records
        await Promise.all([
          transactionsService.refresh(),
          debtsService.load(),
          moneyHeldService.load(),
          transfersService.load(),
          walletsService.load(),
          subscriptionsService.load(),
          interestService.load(),
          budgetsService.load(),
          pushService.init(),
        ]);
      } catch (err) {
        console.error('Coordinated data sync failed', err);
      } finally {
        this.syncPromise = null;
        // Process any pending offline actions now that we're back online / synced.
        void this.offlineQueue.processQueue();
      }
    })();

    return this.syncPromise;
  }
}
