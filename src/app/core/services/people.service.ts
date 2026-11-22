import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Person } from '../models/domain.models';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

interface PersonResponse {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface CreatePersonRequest {
  name: string;
  phone: string | null;
  notes: string | null;
}

interface DeleteResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly api = inject(ApiService);
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
        const rows = await firstValueFrom(
          this.api.get<PersonResponse[]>('/people'),
        );
        this._people.set(rows as Person[]);
      } catch (err) {
        console.error('Failed to load people', err);
      } finally {
        this._isLoading.set(false);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  async createPerson(name: string, phone: string | null, notes: string | null): Promise<Person> {
    return this.create(name, phone, notes);
  }

  async create(name: string, phone: string | null, notes: string | null): Promise<Person> {
    try {
      const created = await firstValueFrom(
        this.api.post<PersonResponse>('/people', {
          name: name.trim(),
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
        } as CreatePersonRequest),
      );
      const person = created as Person;
      this._people.update((list) => [...list, person]);
      return person;
    } catch (error) {
      console.error('Failed to create person', error);
      throw error;
    }
  }

  async updatePerson(id: string, input: {
    name?: string;
    phone?: string | null;
    notes?: string | null;
  }): Promise<Person> {
    try {
      const updated = await firstValueFrom(
        this.api.patch<PersonResponse>(`/people/${id}`, {
          name: input.name?.trim(),
          phone: input.phone?.trim() || null,
          notes: input.notes?.trim() || null,
        } as CreatePersonRequest),
      );
      return updated as Person;
    } catch (error) {
      console.error('Failed to update person', error);
      throw error;
    }
  }

  async deletePerson(id: string): Promise<void> {
    return this.delete(id);
  }

  async delete(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<DeleteResponse>(`/people/${id}`));
      this._people.update((list) => list.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete person', error);
      throw error;
    }
  }
}
