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
        // Fetch from Supabase first
        const { data, error } = await this.supabase.client
          .from('bank_accounts')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const remoteList = (data as BankAccount[]).filter(
            (c) => !c.id.startsWith('demo_card_') && !c.id.startsWith('sample_card_')
          );

          if (remoteList.length > 0) {
            this._bankAccounts.set(remoteList);
            this.saveToLocal(remoteList);
            return;
          }

          // If Supabase table is empty, check if user has local cards to upload
          const localCards = this.getLocalCards();
          if (localCards.length > 0) {
            this._bankAccounts.set(localCards);
            void this.syncLocalCardsToSupabase(localCards);
            return;
          }

          this._bankAccounts.set([]);
          this.saveToLocal([]);
          return;
        }
      } catch {
        // Ignore remote error, fallback to local storage
      }

      // LocalStorage fallback
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local) as BankAccount[];
          if (Array.isArray(parsed)) {
            // Purge any residual demo/sample cards from local storage
            const cleaned = parsed.filter(
              (c) => !c.id.startsWith('demo_card_') && !c.id.startsWith('sample_card_')
            );
            this._bankAccounts.set(cleaned);
            if (cleaned.length !== parsed.length) {
              this.saveToLocal(cleaned);
            }
            return;
          }
        }
      } catch {
        // Ignore parse error
      }

      // Default strictly to empty array
      this._bankAccounts.set([]);
      this.saveToLocal([]);
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
    const ownerId = this.auth.user()?.id ?? 'local_user';
    const isFirst = this._bankAccounts().length === 0;

    const newCard: BankAccount = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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

    updatedList = [newCard, ...updatedList];
    this._bankAccounts.set(updatedList);
    this.saveToLocal(updatedList);

    if (newCard.is_primary) {
      try {
        const txService = this.injector.get(TransactionsService);
        void txService.mapUnassignedTransactionsToPrimary(newCard.id);
      } catch {}
    }

    // Attempt remote save in background
    try {
      await this.supabase.client.from('bank_accounts').insert(newCard);
    } catch {
      // Remote save optional
    }

    return newCard;
  }

  async update(id: string, changes: Partial<BankAccount>): Promise<BankAccount | null> {
    const current = this._bankAccounts().find((c) => c.id === id);
    if (!current) return null;

    let updatedList = this._bankAccounts().map((c) => {
      if (c.id === id) {
        return { ...c, ...changes };
      }
      if (changes.is_primary && c.id !== id) {
        return { ...c, is_primary: false };
      }
      return c;
    });

    this._bankAccounts.set(updatedList);
    this.saveToLocal(updatedList);

    const updatedCard = updatedList.find((c) => c.id === id) ?? null;

    try {
      await this.supabase.client
        .from('bank_accounts')
        .update(changes)
        .eq('id', id);
    } catch {
      // Remote update optional
    }

    return updatedCard;
  }

  async delete(id: string): Promise<void> {
    let updatedList = this._bankAccounts().filter((c) => c.id !== id);

    // If deleted card was primary and remaining cards exist, make first remaining primary
    if (updatedList.length > 0 && !updatedList.some((c) => c.is_primary)) {
      updatedList = updatedList.map((c, idx) => (idx === 0 ? { ...c, is_primary: true } : c));
    }

    this._bankAccounts.set(updatedList);
    this.saveToLocal(updatedList);

    try {
      await this.supabase.client.from('bank_accounts').delete().eq('id', id);
    } catch {
      // Remote delete optional
    }
  }

  async setPrimary(id: string): Promise<void> {
    const updatedList = this._bankAccounts().map((c) => ({
      ...c,
      is_primary: c.id === id,
    }));
    this._bankAccounts.set(updatedList);
    this.saveToLocal(updatedList);

    try {
      const txService = this.injector.get(TransactionsService);
      void txService.mapUnassignedTransactionsToPrimary(id);
    } catch {}

    try {
      await this.supabase.client
        .from('bank_accounts')
        .update({ is_primary: false })
        .neq('id', id);
      await this.supabase.client
        .from('bank_accounts')
        .update({ is_primary: true })
        .eq('id', id);
    } catch {
      // Remote update optional
    }
  }

  private getLocalCards(): BankAccount[] {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local) as BankAccount[];
        if (Array.isArray(parsed)) {
          return parsed.filter((c) => !c.id.startsWith('demo_card_') && !c.id.startsWith('sample_card_'));
        }
      }
    } catch {}
    return [];
  }

  private async syncLocalCardsToSupabase(cards: BankAccount[]): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId || cards.length === 0) return;

    for (const card of cards) {
      try {
        const payload = { ...card, owner_id: ownerId };
        await this.supabase.client.from('bank_accounts').upsert(payload);
      } catch {}
    }
  }

  private saveToLocal(list: BankAccount[]): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // LocalStorage fallback
    }
  }
}
