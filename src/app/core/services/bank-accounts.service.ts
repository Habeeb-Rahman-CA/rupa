import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { BankAccount, CardType, PaymentNetwork, CardTheme } from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';

const LOCAL_STORAGE_KEY = 'rupa_bank_accounts';

@Injectable({ providedIn: 'root' })
export class BankAccountsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly _bankAccounts = signal<BankAccount[]>([]);
  private readonly _isLoading = signal(false);

  readonly bankAccounts = this._bankAccounts.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isFirstCard = computed(() => this._bankAccounts().length === 0);
  readonly primaryAccount = computed(() => {
    const list = this._bankAccounts();
    return list.find((a) => a.is_primary) ?? list[0] ?? null;
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.load();
      } else {
        this._bankAccounts.set([]);
      }
    });
  }

  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this._bankAccounts.set([]);
      return;
    }
    if (this.loadPromise) return this.loadPromise;

    this._isLoading.set(true);
    this.loadPromise = (async () => {
      try {
        const ownerId = this.auth.user()?.id;
        if (!ownerId) return;

        const { data, error } = await this.supabase.client
          .from('bank_accounts')
          .select('*')
          .eq('owner_id', ownerId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load bank accounts', error);
          return;
        }

        let remoteList = (data ?? []).filter(
          (c) => !c.id.startsWith('demo_card_') && !c.id.startsWith('sample_card_'),
        ) as BankAccount[];

        // One-time migration for cards created by older versions of the app.
        // Existing remote rows win when the same id already exists, so a
        // successful migration cannot overwrite newer database data.
        const legacyCards = this.getLegacyCards();
        const cardsToMigrate = legacyCards
          .filter((card) => !remoteList.some((remote) => remote.id === card.id))
          .map((card) => ({ ...card, owner_id: ownerId }));

        if (cardsToMigrate.length > 0) {
          const { error: migrationError } = await this.supabase.client
            .from('bank_accounts')
            .upsert(cardsToMigrate, { onConflict: 'id' });

          if (migrationError) {
            console.error('Failed to migrate legacy bank accounts', migrationError);
            this._bankAccounts.set(remoteList);
            return;
          }

          const refreshed = await this.supabase.client
            .from('bank_accounts')
            .select('*')
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: false });
          if (refreshed.error) {
            console.error('Failed to reload migrated bank accounts', refreshed.error);
            this._bankAccounts.set(remoteList);
            return;
          }
          const refreshedList = (refreshed.data ?? []) as BankAccount[];
          const missingIds = cardsToMigrate.filter(
            (card) => !refreshedList.some((remote) => remote.id === card.id),
          );
          if (missingIds.length > 0) {
            console.error('Migrated bank accounts were not readable after write', missingIds);
            this._bankAccounts.set(remoteList);
            return;
          }
          remoteList = refreshedList;
        }

        // Only clear the legacy storage after the database has accepted all
        // legacy records. If migration failed, the data remains available for
        // a later retry instead of being silently discarded.
        if (this.hasLegacyStorage()) {
          this.clearLegacyCards();
        }

        this._bankAccounts.set(remoteList);
      } catch (err) {
        console.error('Failed to load bank accounts', err);
      }
    })().finally(() => {
      this._isLoading.set(false);
      this.loadPromise = null;
    });

    return this.loadPromise;
  }

  async create(account: {
    bank_name: string;
    account_name: string;
    card_type: CardType;
    payment_network: PaymentNetwork;
    card_number_masked: string;
    expiry_date: string;
    cardholder_name: string;
    account_number_masked?: string;
    ifsc_code?: string;
    balance?: number;
    credit_limit?: number;
    theme: CardTheme;
    is_primary?: boolean;
  }): Promise<BankAccount> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');
    const isFirst = this._bankAccounts().length === 0;

    const newCard: BankAccount = {
      id: generateUniqueId('card'),
      owner_id: ownerId,
      bank_name: account.bank_name.trim(),
      account_name: account.account_name.trim() || `${account.bank_name} Card`,
      card_type: account.card_type,
      payment_network: account.payment_network,
      card_number_masked: account.card_number_masked.trim() || '4329',
      expiry_date: account.expiry_date.trim() || '12/28',
      cardholder_name: account.cardholder_name.trim().toUpperCase() || 'PRIMARY HOLDER',
      account_number_masked: account.account_number_masked?.trim() || undefined,
      ifsc_code: account.ifsc_code?.trim() || undefined,
      balance: account.balance ?? 0,
      credit_limit: account.credit_limit,
      theme: account.theme || 'blue',
      is_primary: isFirst ? true : !!account.is_primary,
      created_at: new Date().toISOString(),
    };

    let updatedList = this._bankAccounts();
    if (newCard.is_primary) {
      updatedList = updatedList.map((c) => ({ ...c, is_primary: false }));
    }

    const { error } = await this.supabase.client.from('bank_accounts').insert(newCard);
    if (error) {
      console.error('Failed to save new bank account in Supabase', error);
      throw error;
    }

    if (newCard.is_primary) {
      const { error: othersError } = await this.supabase.client
        .from('bank_accounts')
        .update({ is_primary: false })
        .eq('owner_id', ownerId)
        .neq('id', newCard.id);
      if (othersError) {
        console.error('Failed to update existing primary bank account', othersError);
        throw othersError;
      }
    }

    updatedList = [newCard, ...updatedList];
    this._bankAccounts.set(updatedList);

    if (newCard.is_primary) {
      try {
        const txService = this.injector.get(TransactionsService);
        await txService.mapUnassignedTransactionsToPrimary(newCard.id);
      } catch (err) {
        console.error('Failed to map bank transactions to new primary card', err);
      }
    }

    return newCard;
  }

  async update(id: string, changes: Partial<BankAccount>): Promise<BankAccount | null> {
    const current = this._bankAccounts().find((c) => c.id === id);
    if (!current) return null;

    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const updatedList = this._bankAccounts().map((c) => {
      if (c.id === id) {
        return { ...c, ...changes };
      }
      if (changes.is_primary && c.id !== id) {
        return { ...c, is_primary: false };
      }
      return c;
    });

    const updatedCard = updatedList.find((c) => c.id === id) ?? null;

    if (changes.is_primary) {
      const targetQuery = this.supabase.client
        .from('bank_accounts')
        .update(changes)
        .eq('id', id)
        .eq('owner_id', ownerId);
      const { error: targetError } = await targetQuery;
      if (targetError) throw targetError;

      const { error: othersError } = await this.supabase.client
        .from('bank_accounts')
        .update({ is_primary: false })
        .eq('owner_id', ownerId)
        .neq('id', id);
      if (othersError) throw othersError;
    } else {
      const { error } = await this.supabase.client
        .from('bank_accounts')
        .update(changes)
        .eq('id', id)
        .eq('owner_id', ownerId);
      if (error) throw error;
    }

    this._bankAccounts.set(updatedList);

    if (changes.is_primary) {
      try {
        const txService = this.injector.get(TransactionsService);
        await txService.mapUnassignedTransactionsToPrimary(id);
      } catch (err) {
        console.error('Failed to map bank transactions to primary card', err);
      }
    }

    return updatedCard;
  }

  async delete(id: string): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const current = this._bankAccounts().find((c) => c.id === id);
    if (!current) return;

    let updatedList = this._bankAccounts().filter((c) => c.id !== id);

    // If deleted card was primary and remaining cards exist, make first remaining primary
    const replacement = updatedList.length > 0 && current.is_primary ? updatedList[0] : null;
    if (replacement) {
      updatedList = updatedList.map((c, idx) => (idx === 0 ? { ...c, is_primary: true } : c));
    }

    const { error } = await this.supabase.client
      .from('bank_accounts')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId);
    if (error) {
      console.error('Failed to delete bank account in Supabase', error);
      throw error;
    }

    if (replacement) {
      const { error: replacementError } = await this.supabase.client
        .from('bank_accounts')
        .update({ is_primary: true })
        .eq('id', replacement.id)
        .eq('owner_id', ownerId);
      if (replacementError) throw replacementError;
    }

    this._bankAccounts.set(updatedList);
  }

  async setPrimary(id: string): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) throw new Error('Not signed in.');

    const updatedList = this._bankAccounts().map((c) => ({
      ...c,
      is_primary: c.id === id,
    }));

    const { error: targetError } = await this.supabase.client
      .from('bank_accounts')
      .update({ is_primary: true })
      .eq('id', id)
      .eq('owner_id', ownerId);
    if (targetError) throw targetError;

    const { error: othersError } = await this.supabase.client
      .from('bank_accounts')
      .update({ is_primary: false })
      .eq('owner_id', ownerId)
      .neq('id', id);
    if (othersError) throw othersError;

    this._bankAccounts.set(updatedList);

    try {
      const txService = this.injector.get(TransactionsService);
      await txService.mapUnassignedTransactionsToPrimary(id);
    } catch (err) {
      console.error('Failed to map bank transactions to primary account', err);
    }
  }

  private getLegacyCards(): BankAccount[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local) as BankAccount[];
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (c) =>
              !!c?.id &&
              !c.id.startsWith('demo_card_') &&
              !c.id.startsWith('sample_card_'),
          );
        }
      }
    } catch (err) {
      console.warn('Could not read legacy bank accounts from localStorage', err);
    }
    return [];
  }

  private clearLegacyCards(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Could not clear legacy bank accounts from localStorage', err);
    }
  }

  private hasLegacyStorage(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }
}

function generateUniqueId(prefix = 'card'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const ts = Date.now().toString(36);
  const perf = typeof performance !== 'undefined' ? performance.now().toString(36).replace('.', '') : '';
  const rand1 = Math.random().toString(36).substring(2, 10);
  const rand2 = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${ts}_${perf}_${rand1}${rand2}`;
}
