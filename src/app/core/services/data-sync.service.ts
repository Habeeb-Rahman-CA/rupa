import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { CategoriesService } from './categories.service';
import { PeopleService } from './people.service';
import { TransactionsService } from './transactions.service';
import { DebtsService } from './debts.service';
import { EventsService } from './events.service';

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  private readonly auth = inject(AuthService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly peopleService = inject(PeopleService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly debtsService = inject(DebtsService);
  private readonly eventsService = inject(EventsService);

  private syncPromise: Promise<void> | null = null;

  constructor() {
    // Whenever user is authenticated, trigger orchestrated 2-phase data load
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.syncAll();
      }
    });
  }

  /**
   * Coordinated 2-phase data synchronization:
   * Phase 1: Load lookup data (Categories & People) first
   * Phase 2: Load dependent financial records (Transactions, Debts, Events)
   */
  async syncAll(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = (async () => {
      try {
        // Phase 1: Master lookups
        await Promise.all([
          this.categoriesService.load(),
          this.peopleService.load(),
        ]);

        // Phase 2: Relational ledger records
        const detailId = this.eventsService.currentDetail()?.event.id;
        await Promise.all([
          this.transactionsService.refresh(),
          this.debtsService.load(),
          this.eventsService.loadList(),
          detailId ? this.eventsService.loadDetail(detailId) : Promise.resolve(),
        ]);
      } catch (err) {
        console.error('Coordinated data sync failed', err);
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }
}
