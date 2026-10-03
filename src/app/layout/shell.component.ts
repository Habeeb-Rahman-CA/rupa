import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { filter, map } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../core/services/auth.service';
import { DataSyncService } from '../core/services/data-sync.service';
import { PwaUpdateService } from '../core/services/pwa-update.service';
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
    MatProgressSpinnerModule,
    LucideAngularModule,
    PullToRefreshDirective,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements AfterViewInit {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly auth = inject(AuthService);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly pwaUpdateService = inject(PwaUpdateService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly debtsService = inject(DebtsService);
  private readonly eventsService = inject(EventsService);
  private readonly peopleService = inject(PeopleService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('bottomNav') bottomNavRef?: ElementRef<HTMLElement>;

  readonly pillStyle = signal({ left: '0px', width: '0px', opacity: 0 });
  readonly pillAnimated = signal(false);
  readonly isSigningOut = signal(false);

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

  readonly settingsNav: NavItem[] = [
    { path: '/bank-accounts', label: 'Bank Accounts', icon: 'credit-card' },
    { path: '/categories',    label: 'Categories',    icon: 'tags' },
    { path: '/people',        label: 'People',        icon: 'users' },
  ];

  readonly moreNav: NavItem[] = [
    { path: '/reports',       label: 'Reports',       icon: 'trending-up' },
    { path: '/bank-accounts', label: 'Bank Accounts', icon: 'credit-card' },
    { path: '/categories',    label: 'Categories',    icon: 'tags' },
    { path: '/people',        label: 'People',        icon: 'users' },
  ];

  readonly appVersion = APP_VERSION;
  readonly balance = this.transactionsService.balance;
  readonly userEmail = computed(() => this.auth.user()?.email ?? '');
  readonly pwaUpdateAvailable = this.pwaUpdateService.updateAvailable;
  readonly isCheckingPwa = this.pwaUpdateService.isChecking;

  readonly displayName = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
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

  ngAfterViewInit(): void {
    // Initial measurement
    setTimeout(() => {
      this.updatePillPosition();
      requestAnimationFrame(() => {
        this.pillAnimated.set(true);
      });
    }, 50);

    // Listen to route changes to update active pill position
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        setTimeout(() => this.updatePillPosition(), 0);
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updatePillPosition();
  }

  updatePillPosition(): void {
    if (!this.bottomNavRef) return;
    const navEl = this.bottomNavRef.nativeElement;
    const activeTab = navEl.querySelector('.tab.active') as HTMLElement | null;
    if (activeTab) {
      this.pillStyle.set({
        left: `${activeTab.offsetLeft}px`,
        width: `${activeTab.offsetWidth}px`,
        opacity: 1,
      });
    } else {
      this.pillStyle.set({ left: '0px', width: '0px', opacity: 0 });
    }
  }

  openQuickAdd(): void {
    this.bottomSheet.open(QuickAddSheetComponent, { panelClass: 'quick-add-sheet' });
  }

  onTabClick(event: MouseEvent, path: string): void {
    if (this.router.url.split('?')[0] === path) {
      event.preventDefault();
      const mainEl = document.querySelector('.mobile-main') || document.querySelector('.desktop-content');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      // Instantly glide pill on click frame
      const target = event.currentTarget as HTMLElement | null;
      if (target && target.classList.contains('tab')) {
        this.pillStyle.set({
          left: `${target.offsetLeft}px`,
          width: `${target.offsetWidth}px`,
          opacity: 1,
        });
      }
    }
  }

  async checkPwaUpdate(): Promise<void> {
    await this.pwaUpdateService.checkForUpdate(true);
  }

  async reloadPwa(): Promise<void> {
    await this.pwaUpdateService.reloadToUpdate();
  }

  async signOut(): Promise<void> {
    if (this.isSigningOut()) return;
    this.isSigningOut.set(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
    this.isSigningOut.set(false);
  }

  readonly refreshAll = async (): Promise<void> => {
    await this.auth.refreshIfPossible();
    await this.dataSyncService.syncAll();
  };
}

