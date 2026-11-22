import { TestBed } from '@angular/core/testing';
import { CategoriesService } from './categories.service';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';
import { signal } from '@angular/core';
import { Category } from '../models/domain.models';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockApi: any;
  let mockAuth: any;
  const isAuthSignal = signal(true);

  const initialCategories: Category[] = [
    { id: '1', owner_id: 'u1', name: 'Salary', kind: 'income', created_at: '' },
    { id: '2', owner_id: 'u1', name: 'Food', kind: 'expense', created_at: '' },
    { id: '3', owner_id: 'u1', name: 'Rent', kind: 'expense', created_at: '' },
    { id: '4', owner_id: 'u1', name: 'Emergency', kind: 'savings', created_at: '' },
  ];

  beforeEach(() => {
    isAuthSignal.set(true);
    mockAuth = {
      isAuthenticated: isAuthSignal,
      user: signal({ id: 'u1' }),
    };

    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.rejectWith(new Error('Delete failed')),
    };

    TestBed.configureTestingModule({
      providers: [
        CategoriesService,
        { provide: AuthService, useValue: mockAuth },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(CategoriesService);
    (service as any)._categories.set([...initialCategories]);
  });

  it('should restore category at exact original index when backend delete fails', async () => {
    // Delete 'Food' which is at index 1
    try {
      await service.delete('2');
    } catch {
      // Expected backend error
    }

    const categories = service.categories();
    expect(categories.length).toBe(4);
    expect(categories[1].id).toBe('2'); // Restored back to index 1
    expect(categories.map((c) => c.name)).toEqual(['Salary', 'Food', 'Rent', 'Emergency']);
  });
});
