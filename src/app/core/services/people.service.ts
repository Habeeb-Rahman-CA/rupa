import { Injectable, effect, inject, signal } from '@angular/core';
import { Person } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { OfflineQueueService } from './offline-queue.service';

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly offlineQueue = inject(OfflineQueueService);

  private readonly _people = signal<Person[]>([]);
  private readonly _isLoading = signal(false);

  readonly people = this._people.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._people.set([]);
      }
    });

    // Register offline-sync handler for the people table.
    this.offlineQueue.registerHandler('people', async (action) => {
      const p = action.payload as Record<string, unknown>;
      if (action.type === 'create') {
        const { data, error } = await this.supabase.client
          .from('people')
          .insert({
            owner_id: p['owner_id'] as string,
            name: p['name'] as string,
            phone: p['phone'] as string | null,
            notes: p['notes'] as string | null,
          })
          .select()
          .single();
        if (error) throw error;
        const created = data as Person;
        this._people.update((list) =>
          [...list.map((person) => (person.id === p['localId'] ? created : person))].sort(byName),
        );
      } else if (action.type === 'delete') {
        const { error } = await this.supabase.client
          .from('people')
          .delete()
          .eq('id', p['id'] as string)
          .eq('owner_id', this.auth.user()?.id);
        if (error) throw error;
        const deleteId = p['id'] as string;
        this._people.update((list) => list.filter((person) => person.id !== deleteId));
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._people.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('people')
          .select('id, owner_id, name, phone, notes, created_at')
          .order('name', { ascending: true });

        if (error) {
          console.error('Failed to load people', error);
          return;
        }
        this._people.set((data ?? []) as Person[]);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async create(name: string, phone?: string | null, notes?: string | null): Promise<Person> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name is required.');

    const ownerId = this.requireUserId();

    // Offline path: enqueue person creation and apply optimistically.
    if (!this.offlineQueue.isOnline()) {
      const localId = `local_${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
      const optimistic: Person = {
        id: localId,
        owner_id: ownerId,
        name: trimmed,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        created_at: new Date().toISOString(),
      } as Person;

      await this.offlineQueue.enqueue({
        type: 'create',
        table: 'people',
        payload: {
          localId,
          owner_id: ownerId,
          name: trimmed,
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
        },
      });

      this._people.update((list) => [...list, optimistic].sort(byName));
      return optimistic;
    }

    const { data, error } = await this.supabase.client
      .from('people')
      .insert({
        owner_id: ownerId,
        name: trimmed,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to create person', error);
      throw error;
    }
    const created = data as Person;
    this._people.update((list) => [...list, created].sort(byName));
    return created;
  }

  async delete(id: string): Promise<void> {
    const person = this._people().find((p) => p.id === id);
    if (!person) return;

    // 1. Optimistic removal for instant UI feedback
    this._people.update((list) => list.filter((p) => p.id !== id));

    // Offline path: enqueue person deletion.
    if (!this.offlineQueue.isOnline()) {
      await this.offlineQueue.enqueue({
        type: 'delete',
        table: 'people',
        payload: {
          id,
          owner_id: person.owner_id,
        },
      });
      return;
    }

    const { error } = await this.supabase.client.from('people').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete person', error);
      // Revert on failure
      this._people.update((list) => [...list, person]);
      throw error;
    }
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}

function byName(a: Person, b: Person): number {
  return a.name.localeCompare(b.name);
}
