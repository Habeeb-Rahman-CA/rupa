import { TestBed } from '@angular/core/testing';
import { CategoriesService } from './categories.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { signal } from '@angular/core';
import { Category } from '../models/domain.models';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockSupabase: any;
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

    mockSupabase = {
      client: {
        from: jasmine.createSpy().and.returnValue({
          select: jasmine.createSpy().and.returnThis(),
          order: jasmine.createSpy().and.returnThis(),
          delete: jasmine.createSpy().and.returnThis(),
          eq: jasmine.createSpy().and.resolveTo({ error: new Error('Delete failed') }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        CategoriesService,
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
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
