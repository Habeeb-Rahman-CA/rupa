import { TestBed } from '@angular/core/testing';
import { DebtsService } from './debts.service';
import { AuthService } from './auth.service';
import { ApiService } from '../http';
import { TransactionsService } from './transactions.service';
import { signal } from '@angular/core';

describe('DebtsService', () => {
  let service: DebtsService;
  let mockApi: any;
  let mockAuth: any;
  const isAuthSignal = signal(true);

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'user_1' }),
    };

    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({ id: 'debt_1', principal: 100, outstanding: 100 }),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        DebtsService,
        { provide: AuthService, useValue: mockAuth },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(DebtsService);
  });

  it('should create a debt', async () => {
    const debt = await service.createDebt({
      person_id: 'p1',
      direction: 'they_owe',
      principal: 50,
      reason: null,
      opened_on: '2026-11-01',
    });
    expect(debt.id).toBeDefined();
  });

  it('should delete a debt', async () => {
    await service.deleteDebt('debt_1');
    expect(mockApi.delete).toHaveBeenCalledWith('/debts/debt_1');
  });
});
