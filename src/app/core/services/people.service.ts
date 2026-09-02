import { Injectable, effect, inject, signal } from '@angular/core';
import { Person } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

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
  }

  async load(): Promise<void> {
    this._isLoading.set(true);
    const { data, error } = await this.supabase.client
      .from('people')
      .select('*')
      .order('name', { ascending: true });
    this._isLoading.set(false);

    if (error) {
      console.error('Failed to load people', error);
      return;
    }
    this._people.set((data ?? []) as Person[]);
  }

  async create(name: string, phone?: string | null, notes?: string | null): Promise<Person> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name is required.');

    const ownerId = this.requireUserId();
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
    const { error } = await this.supabase.client.from('people').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete person', error);
      throw error;
    }
    this._people.update((list) => list.filter((p) => p.id !== id));
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
