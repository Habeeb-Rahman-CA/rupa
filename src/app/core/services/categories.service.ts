import { Injectable, effect, inject, signal } from '@angular/core';
import { Category, CategoryKind } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const DEFAULT_CATEGORIES: Array<{ name: string; kind: CategoryKind }> = [
  { name: 'Salary',    kind: 'income' },
  { name: 'PF',        kind: 'income' },
  { name: 'Food',      kind: 'expense' },
  { name: 'Rent',      kind: 'expense' },
  { name: 'Fuel',      kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Bills',     kind: 'expense' },
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

  async load(): Promise<void> {
    this._isLoading.set(true);
    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*')
      .order('kind', { ascending: true })
      .order('name', { ascending: true });
    this._isLoading.set(false);

    if (error) {
      console.error('Failed to load categories', error);
      return;
    }
    this._categories.set((data ?? []) as Category[]);
  }

  async create(name: string, kind: CategoryKind): Promise<Category | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const ownerId = this.requireUserId();

    const { data, error } = await this.supabase.client
      .from('categories')
      .insert({ owner_id: ownerId, name: trimmed, kind })
      .select()
      .single();

    if (error) {
      console.error('Failed to create category', error);
      throw error;
    }

    const created = data as Category;
    this._categories.update((list) => [...list, created]);
    return created;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Failed to delete category', error);
      throw error;
    }
    this._categories.update((list) => list.filter((c) => c.id !== id));
  }

  async seedDefaults(): Promise<void> {
    const existing = this._categories();
    const missing = DEFAULT_CATEGORIES.filter(
      (d) => !existing.some((c) => c.name === d.name && c.kind === d.kind),
    );
    if (missing.length === 0) return;

    const ownerId = this.requireUserId();
    const rows = missing.map((m) => ({ ...m, owner_id: ownerId }));

    const { data, error } = await this.supabase.client
      .from('categories')
      .insert(rows)
      .select();

    if (error) {
      console.error('Failed to seed default categories', error);
      throw error;
    }
    this._categories.update((list) => [...list, ...((data ?? []) as Category[])]);
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}
