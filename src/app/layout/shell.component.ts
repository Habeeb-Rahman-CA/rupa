import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../core/services/auth.service';
import { TransactionsService } from '../core/services/transactions.service';
import { CategoriesService } from '../core/services/categories.service';
import { DebtsService } from '../core/services/debts.service';
import { EventsService } from '../core/services/events.service';
import { PeopleService } from '../core/services/people.service';
import { APP_VERSION } from '../core/app-version';
import { QuickAddSheetComponent } from '../features/transactions/quick-add-sheet.component';
import { PullToRefreshDirective } from '../shared/directives/pull-to-refresh.directive';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    LucideAngularModule,
    PullToRefreshDirective,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly auth = inject(AuthService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly debtsService = inject(DebtsService);
  private readonly eventsService = inject(EventsService);
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);

  readonly isHandset = toSignal(
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly navLeft: NavItem[] = [
    { path: '/dashboard',    label: 'Home',   icon: 'home' },
    { path: '/transactions', label: 'Txns',   icon: 'receipt' },
  ];
  readonly navRight: NavItem[] = [
    { path: '/debts',  label: 'Owed',   icon: 'handshake' },
    { path: '/events', label: 'Splits', icon: 'split' },
  ];

  readonly moreNav: NavItem[] = [
    { path: '/categories', label: 'Categories', icon: 'tags' },
    { path: '/people',     label: 'People',     icon: 'users' },
    { path: '/reports',    label: 'Reports',    icon: 'trending-up' },
  ];

  readonly appVersion = APP_VERSION;
  readonly balance = this.transactionsService.balance;
  readonly userEmail = computed(() => this.auth.user()?.email ?? '');
  readonly displayName = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    // Prefer the name captured at signup, then any full_name from OAuth,
    // then finally a capitalized email prefix as a legacy fallback.
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const fromMeta =
      (typeof meta['name'] === 'string' ? meta['name'] : '') ||
      (typeof meta['full_name'] === 'string' ? meta['full_name'] : '');
    if (fromMeta && fromMeta.trim()) {
      const first = fromMeta.trim().split(/\s+/)[0];
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
    const email = u.email ?? '';
    if (!email) return '';
    const local = email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  });

  openQuickAdd(): void {
    this.bottomSheet.open(QuickAddSheetComponent, { panelClass: 'quick-add-sheet' });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // Bound as a field so `this` is preserved when passed as a callback.
  readonly refreshAll = async (): Promise<void> => {
    await this.auth.refreshIfPossible();
    const detailId = this.eventsService.currentDetail()?.event.id;
    await Promise.all([
      this.transactionsService.refresh(),
      this.categoriesService.load(),
      this.peopleService.load(),
      this.debtsService.load(),
      this.eventsService.loadList(),
      detailId ? this.eventsService.loadDetail(detailId) : Promise.resolve(),
    ]);
  };
}
