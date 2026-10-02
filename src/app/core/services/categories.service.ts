import { Injectable, effect, inject, signal } from '@angular/core';
import { Category, CategoryKind, markAsSavingsCategory } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const DEFAULT_CATEGORIES: Array<{ name: string; kind: CategoryKind }> = [
  { name: 'Salary',          kind: 'income' },
  { name: 'PF',              kind: 'income' },
  { name: 'Food',            kind: 'expense' },
  { name: 'Rent',            kind: 'expense' },
  { name: 'Fuel',            kind: 'expense' },
  { name: 'Groceries',       kind: 'expense' },
  { name: 'Bills',           kind: 'expense' },
  { name: 'Emergency Fund',  kind: 'savings' },
  { name: 'Mutual Funds',    kind: 'savings' },
  { name: 'Gold & FDs',      kind: 'savings' },
  { name: 'General Savings', kind: 'savings' },
];

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _categories = signal<Category[]>([]);
  private readonly _isLoading = signal(false);

  readonly categories = this._categories.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    // Load whenever the user changes (login/logout).
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._categories.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._categories.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('categories')
          .select('*')
          .order('kind', { ascending: true })
          .order('name', { ascending: true });

        if (error) {
          console.error('Failed to load categories', error);
          return;
        }
        this._categories.set((data ?? []) as Category[]);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(name: string, kind: CategoryKind): Promise<Category | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const ownerId = this.requireUserId();

    let result = await this.supabase.client
      .from('categories')
      .insert({ owner_id: ownerId, name: trimmed, kind })
      .select()
      .single();

    if (result.error && (kind === 'savings' || result.error.code === '23514')) {
      // Fallback if DB check constraint on Supabase cloud hasn't been updated yet
      result = await this.supabase.client
        .from('categories')
        .insert({ owner_id: ownerId, name: trimmed, kind: 'expense' })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Failed to create category', result.error);
      throw result.error;
    }

    const created = result.data as Category;
    if (kind === 'savings') {
      markAsSavingsCategory(created.id);
    }
    this._categories.update((list) => [...list, created]);
    return created;
  }

  async delete(id: string): Promise<void> {
    const category = this._categories().find((c) => c.id === id);
    if (!category) return;

    // 1. Optimistic removal for instant UI feedback
    this._categories.update((list) => list.filter((c) => c.id !== id));

    const { error } = await this.supabase.client
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Failed to delete category', error);
      // Revert on failure
      this._categories.update((list) => [...list, category]);
      throw error;
    }
  }

  async seedDefaults(): Promise<void> {
    const existing = this._categories();
    const missing = DEFAULT_CATEGORIES.filter(
      (d) => !existing.some((c) => c.name.toLowerCase() === d.name.toLowerCase()),
    );
    if (missing.length === 0) return;

    for (const item of missing) {
      try {
        await this.create(item.name, item.kind);
      } catch (err) {
        console.error(`Could not seed category ${item.name}`, err);
      }
    }
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}
