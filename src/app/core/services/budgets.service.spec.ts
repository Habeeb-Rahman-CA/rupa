import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Budget, Transaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BudgetsService } from './budgets.service';
import { CategoriesService } from './categories.service';
import { ApiService } from '../http';
import { TransactionsService } from './transactions.service';
import { periodRange, todayIso, toIsoDate } from '../../shared/utils/budget-utils';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      patch: jasmine.createSpy('patch').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        BudgetsService,
        { provide: AuthService, useValue: { isAuthenticated: signal(true), user: signal({ id: 'u1' }) } },
        { provide: CategoriesService, useValue: { categories: signal([]) } },
        { provide: TransactionsService, useValue: { } },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(BudgetsService);
  });

  it('should create a budget', async () => {
    const budget = await service.createBudget({
      name: 'Groceries',
      category_id: null,
      amount: 5000,
      period: 'monthly',
      start_date: todayIso(),
      end_date: todayIso(),
      recurring: true,
      thresholds: [50, 75, 90, 100],
    });
    expect(budget.id).toBeDefined();
  });
});
