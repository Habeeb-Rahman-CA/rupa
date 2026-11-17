import { Injectable, effect, inject, signal } from '@angular/core';
import {
  Category,
  CategoryKind,
  isSavingsCategory,
  markAsSavingsCategory,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { OfflineQueueService } from './offline-queue.service';

const DEFAULT_CATEGORIES: Array<{ name: string; kind: CategoryKind }> = [
  { name: 'Salary', kind: 'income' },
  { name: 'PF', kind: 'income' },
  { name: 'Food', kind: 'expense' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Fuel', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Bills', kind: 'expense' },
  { name: 'Emergency Fund', kind: 'savings' },
  { name: 'Mutual Funds', kind: 'savings' },
  { name: 'Gold & FDs', kind: 'savings' },
  { name: 'General Savings', kind: 'savings' },
];

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly offlineQueue = inject(OfflineQueueService);

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

    // Register offline-sync handler for the categories table.
    this.offlineQueue.registerHandler('categories', async (action) => {
      const p = action.payload as Record<string, unknown>;
      if (action.type === 'create') {
        const { data, error } = await this.supabase.client
          .from('categories')
          .insert({
            owner_id: p['owner_id'] as string,
            name: p['name'] as string,
            kind: p['kind'],
          })
          .select()
          .single();
        if (error) throw error;
        const created = { ...(data as Category), kind: p['kind'] as CategoryKind };
        if (p['kind'] === 'savings') {
          markAsSavingsCategory(created.id, p['owner_id'] as string);
        }
        this._categories.update((list) => list.map((c) => (c.id === p['localId'] ? created : c)));
      } else if (action.type === 'delete') {
        const { error } = await this.supabase.client
          .from('categories')
          .delete()
          .eq('id', p['id'] as string)
          .eq('owner_id', this.auth.user()?.id);
        if (error) throw error;
        this._categories.update((list) => list.filter((c) => c.id !== p['id']));
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
          .select('id, owner_id, name, kind, created_at')
          .order('kind', { ascending: true })
          .order('name', { ascending: true });

        if (error) {
          console.error('Failed to load categories', error);
          return;
        }
        const categories = ((data ?? []) as Category[]).map((c) => {
          if (isSavingsCategory(c, this.requireUserId())) {
            return { ...c, kind: 'savings' as const };
          }
          return c;
        });
        this._categories.set(categories);
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

    // Offline path: enqueue category creation and apply optimistically.
    if (!this.offlineQueue.isOnline()) {
      const localId = `local_${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
      const optimistic: Category = {
        id: localId,
        owner_id: ownerId,
        name: trimmed,
        kind,
        created_at: new Date().toISOString(),
      } as Category;

      await this.offlineQueue.enqueue({
        type: 'create',
        table: 'categories',
        payload: {
          localId,
          owner_id: ownerId,
          name: trimmed,
          kind,
        },
      });

      this._categories.update((list) => [...list, optimistic]);
      return optimistic;
    }

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

    const created = {
      ...(result.data as Category),
      kind, // Enforce domain model consistency for savings categories
    };

    if (kind === 'savings') {
      markAsSavingsCategory(created.id, ownerId);
    }
    this._categories.update((list) => [...list, created]);
    return created;
  }

  async delete(id: string): Promise<void> {
    const currentList = this._categories();
    const index = currentList.findIndex((c) => c.id === id);
    if (index === -1) return;
    const category = currentList[index];

    // 1. Optimistic removal for instant UI feedback
    this._categories.update((list) => list.filter((c) => c.id !== id));

    // Offline path: enqueue category deletion.
    if (!this.offlineQueue.isOnline()) {
      await this.offlineQueue.enqueue({
        type: 'delete',
        table: 'categories',
        payload: {
          id,
          owner_id: category.owner_id,
        },
      });
      return;
    }

    const { error } = await this.supabase.client.from('categories').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete category', error);
      // Revert on failure at the exact original index to preserve list order
      this._categories.update((list) => {
        if (list.some((c) => c.id === id)) return list;
        const restored = [...list];
        const insertAt = Math.min(index, restored.length);
        restored.splice(insertAt, 0, category);
        return restored;
      });
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
