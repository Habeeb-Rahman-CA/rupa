import { Injectable, inject } from '@angular/core';

import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { DEVICE_KEYS, STORAGE_PREFIX } from '../config/storage-keys';
import { errorText } from '../../shared/utils/error-utils';

/** Selectable data groups — must match the whitelist in migration 0026. */
export type ResetGroupId =
  | 'transactions'
  | 'debts'
  | 'cards'
  | 'wallets'
  | 'transfers'
  | 'money_held'
  | 'subscriptions'
  | 'interest'
  | 'budgets'
  | 'categories'
  | 'people'
  | 'app_settings';

export interface ResetGroupDef {
  id: ResetGroupId;
  label: string;
  hint: string;
}

/**
 * Groups that are force-included when another group is chosen, because their
 * rows reference it with ON DELETE RESTRICT (or deleting it would corrupt it).
 * Mirrors the closure block in db/migrations/0026_reset_user_data.sql.
 */
const FORCE_MAP: Readonly<Record<ResetGroupId, readonly ResetGroupId[]>> = {
  transactions: ['debts', 'transfers'],
  people: ['debts', 'money_held'],
  cards: ['transfers', 'interest', 'wallets'],
  debts: [],
  wallets: [],
  transfers: [],
  money_held: [],
  subscriptions: [],
  interest: [],
  budgets: [],
  categories: [],
  app_settings: [],
};

/**
 * Drives Settings → "Reset user data": group catalogue, dependency closure,
 * account-password verification and the bulk-wipe RPC.
 *
 * The password check reuses `signInWithPassword` while already signed in —
 * Supabase never exposes password hashes to the client, so this is the only
 * reliable way to prove the password. A wrong password comes back as
 * "Invalid login credentials"; a success refreshes the same user's session.
 */
@Injectable({ providedIn: 'root' })
export class ResetDataService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** The 12 selectable database groups, in display order. */
  readonly groups: readonly ResetGroupDef[] = [
    { id: 'transactions', label: 'Transactions', hint: 'Every income and expense in the ledger.' },
    {
      id: 'debts',
      label: 'Debts & money owed',
      hint: 'Loans given or taken, with payment history.',
    },
    {
      id: 'cards',
      label: 'Cards & bank accounts',
      hint: 'Saved cards and their balances — linked wallets, transfers and interest go with them.',
    },
    { id: 'wallets', label: 'Wallets', hint: 'Wallets with their recharge and spend history.' },
    { id: 'transfers', label: 'Transfers', hint: 'Money moved between cards.' },
    {
      id: 'money_held',
      label: 'Money held for others',
      hint: 'Amounts received or returned for other people.',
    },
    { id: 'subscriptions', label: 'Subscriptions', hint: 'Plans, renewals and payment history.' },
    { id: 'interest', label: 'Savings & interest', hint: 'Interest entries and disposals.' },
    { id: 'budgets', label: 'Budgets', hint: 'Category budget limits.' },
    { id: 'categories', label: 'Categories', hint: 'Income, expense and savings categories.' },
    { id: 'people', label: 'People', hint: 'People linked to debts and held money.' },
    {
      id: 'app_settings',
      label: 'App settings',
      hint: 'AI provider config and notification history.',
    },
  ];

  /**
   * Expand a raw user selection with every group that must go with it,
   * until stable. The result is what actually gets deleted.
   */
  expandSelection(selected: Iterable<ResetGroupId>): Set<ResetGroupId> {
    const result = new Set(selected);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...result]) {
        for (const forced of FORCE_MAP[id]) {
          if (!result.has(forced)) {
            result.add(forced);
            changed = true;
          }
        }
      }
    }
    return result;
  }

  /** True when `id` is only in the selection because another group forces it. */
  isForced(selected: Iterable<ResetGroupId>, id: ResetGroupId): boolean {
    const base = new Set(selected);
    return !base.has(id) && this.expandSelection(base).has(id);
  }

  /**
   * Verify the account password of the signed-in user.
   * Resolves `{ ok: false, error }` with a friendly message on failure.
   */
  async verifyPassword(password: string): Promise<{ ok: boolean; error?: string }> {
    const email = this.auth.user()?.email;
    if (!email) return { ok: false, error: 'No signed-in account found.' };
    try {
      const { error } = await this.auth.signInWithPassword(email, password);
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          return { ok: false, error: 'Incorrect password. Try again.' };
        }
        if (msg.includes('rate limit') || msg.includes('too many')) {
          return { ok: false, error: 'Too many attempts — wait a moment and try again.' };
        }
        return { ok: false, error: errorText(error, 'Couldn’t verify your password.') };
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: errorText(err, 'Couldn’t verify your password.') };
    }
  }

  /** Delete the given groups server-side (one transaction, password already checked). */
  async resetGroups(groups: readonly ResetGroupId[]): Promise<void> {
    const { error } = await this.supabase.client.rpc('reset_user_data', {
      p_tables: [...groups],
    });
    if (error) throw new Error(errorText(error, 'Couldn’t reset your data.'));
  }

  /**
   * Wipe device-local user data: MPIN lock record, theme, AI consent,
   * user-scoped keys (`rupa:{userId}:*`) and legacy unscoped keys.
   * The Supabase session (`rupa-auth`) is intentionally left untouched.
   */
  clearDeviceData(): void {
    if (typeof localStorage === 'undefined') return;

    const userId = this.auth.user()?.id;
    if (userId) {
      const prefix = `${STORAGE_PREFIX}:${userId}:`;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      for (const key of keys) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore individual removal failures
        }
      }
    }

    const deviceKeys: string[] = [
      DEVICE_KEYS.MPIN,
      DEVICE_KEYS.THEME,
      DEVICE_KEYS.AI_CONSENT,
      DEVICE_KEYS.LEGACY_BANK_ACCOUNTS,
      DEVICE_KEYS.LEGACY_OPENROUTER_API_KEY,
      DEVICE_KEYS.LEGACY_DISMISS_BALANCE_BANNER,
    ];
    for (const key of deviceKeys) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
  }
}
