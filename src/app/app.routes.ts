import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./features/legal/terms.page').then((m) => m.TermsPage),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/transactions.page').then((m) => m.TransactionsPage),
      },
      {
        path: 'debts',
        loadComponent: () =>
          import('./features/debts/debts.page').then((m) => m.DebtsPage),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./features/events/events.page').then((m) => m.EventsPage),
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./features/events/event-detail.page').then((m) => m.EventDetailPage),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/categories/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'people',
        loadComponent: () =>
          import('./features/people/people.page').then((m) => m.PeoplePage),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
