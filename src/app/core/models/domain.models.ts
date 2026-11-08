export type TxDirection = 'in' | 'out';
export type TxSource =
  | 'manual'
  | 'debt'
  | 'opening'
  | 'event'
  | 'transfer'
  | 'wallet_recharge'
  | 'wallet_spend'
  | 'subscription';
export type CategoryKind = 'income' | 'expense' | 'savings';
export type DebtDirection = 'i_owe' | 'they_owe';

export interface Category {
  id: string;
  owner_id: string;
  name: string;
  kind: CategoryKind;
  created_at: string;
}

const SAVINGS_PREFIX = 'rupa_savings_cat_';
const inMemorySavingsCategories = new Set<string>();

function safeGetLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function markAsSavingsCategory(id: string): void {
  if (!id) return;
  inMemorySavingsCategories.add(id);
  const storage = safeGetLocalStorage();
  if (storage) {
    try {
      storage.setItem(SAVINGS_PREFIX + id, 'true');
    } catch (err) {
      console.warn('Failed to persist savings category to localStorage', err);
    }
  }
}

export function isSavingsCategory(cat: Category | null | undefined): boolean {
  if (!cat) return false;
  if (cat.kind === 'savings') return true;
  if (cat.id && inMemorySavingsCategories.has(cat.id)) return true;

  const storage = safeGetLocalStorage();
  if (storage && cat.id) {
    try {
      if (storage.getItem(SAVINGS_PREFIX + cat.id) === 'true') {
        inMemorySavingsCategories.add(cat.id);
        return true;
      }
    } catch (err) {
      console.warn('Failed to read savings category from localStorage', err);
    }
  }
  const name = cat.name.toLowerCase();
  return (
    name.includes('saving') ||
    name.includes('emergency') ||
    name.includes('mutual') ||
    name.includes('gold') ||
    name.includes('fixed deposit') ||
    name.includes('sip') ||
    name.includes('nps') ||
    name.includes('fd') ||
    name.includes('investment') ||
    name.includes('stock') ||
    name.includes('share') ||
    name.includes('bond')
  );
}

export interface Person {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export type PaymentMode = 'cash' | 'bank';

export type MoneyHeldDirection = 'received' | 'returned';

export interface MoneyHeldPerson {
  id: string;
  owner_id: string;
  person_id: string;
  created_at: string;
}

export interface MoneyHeldTransaction {
  id: string;
  owner_id: string;
  held_person_id: string;
  direction: MoneyHeldDirection;
  amount: number;
  occurred_on: string;
  payment_mode: PaymentMode;
  bank_account_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  owner_id: string;
  occurred_on: string;
  amount: number;
  direction: TxDirection;
  category_id: string | null;
  notes: string | null;
  source: TxSource;
  source_ref_id: string | null;
  payment_mode?: PaymentMode;
  bank_account_id?: string | null;
  wallet_id?: string | null;
  created_at: string;
}

export interface AccountTransfer {
  id: string;
  owner_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  occurred_on: string;
  notes: string | null;
  debit_transaction_id: string;
  credit_transaction_id: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  owner_id: string;
  name: string;
  theme: CardTheme;
  initial_balance: number;
  balance: number;
  minimum_balance: number;
  created_at: string;
}

export type WalletTransactionKind = 'recharge' | 'spend';

export interface WalletTransaction {
  id: string;
  owner_id: string;
  wallet_id: string;
  kind: WalletTransactionKind;
  amount: number;
  occurred_on: string;
  category_id: string | null;
  funding_mode: PaymentMode | null;
  bank_account_id: string | null;
  notes: string | null;
  debit_transaction_id: string;
  credit_transaction_id: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  owner_id: string;
  person_id: string;
  direction: DebtDirection;
  principal: number;
  outstanding: number;
  reason: string | null;
  opened_on: string;
  closed_on: string | null;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  amount: number;
  paid_on: string;
  transaction_id: string;
  notes: string | null;
}

export type CardType = 'debit' | 'credit' | 'savings' | 'current' | 'prepaid';
export type PaymentNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'discover';
export type CardTheme =
  | 'blue'
  | 'purple'
  | 'dark'
  | 'emerald'
  | 'sunset'
  | 'gold'
  | 'rose';

export interface BankAccount {
  id: string;
  owner_id: string;
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
  created_at: string;
}

export type SubscriptionBillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired';

export type SubscriptionTheme =
  | 'mint'
  | 'neon'
  | 'rose'
  | 'amber'
  | 'scarlet'
  | 'slate'
  | 'violet';

export interface SubscriptionThemeOption {
  id: SubscriptionTheme;
  name: string;
  subtitle: string;
  accent: string;
  icon: string;
}

export const SUBSCRIPTION_THEMES: readonly SubscriptionThemeOption[] = [
  { id: 'mint', name: 'Mint', subtitle: 'Emerald mint', accent: '#10a37f', icon: 'bot' },
  { id: 'neon', name: 'Neon', subtitle: 'Electric green', accent: '#1db954', icon: 'music' },
  { id: 'rose', name: 'Rose', subtitle: 'Magenta rose', accent: '#fc3c44', icon: 'apple' },
  { id: 'amber', name: 'Amber', subtitle: 'Blaze orange', accent: '#ff6b35', icon: 'dumbbell' },
  { id: 'scarlet', name: 'Scarlet', subtitle: 'Crimson red', accent: '#e50914', icon: 'tv' },
  { id: 'slate', name: 'Slate', subtitle: 'Carbon titanium', accent: '#94a3b8', icon: 'repeat' },
  { id: 'violet', name: 'Violet', subtitle: 'Royal indigo', accent: '#6366f1', icon: 'zap' },
];

export interface Subscription {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  amount: number;
  billing_cycle: SubscriptionBillingCycle;
  start_date: string;
  next_renewal_date: string;
  end_date: string | null;
  payment_account_id: string | null;
  auto_renewal: boolean;
  status: SubscriptionStatus;
  theme: SubscriptionTheme;
  cancelled_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionRenewalStatus = 'completed' | 'skipped';

export interface SubscriptionRenewal {
  id: string;
  owner_id: string;
  subscription_id: string;
  due_on: string;
  renewed_on: string;
  amount: number;
  status: SubscriptionRenewalStatus;
  notes: string | null;
  created_at: string;
}

export interface SubscriptionPayment {
  id: string;
  owner_id: string;
  subscription_id: string;
  renewal_id: string;
  amount: number;
  paid_on: string;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SubscriptionPriceChange {
  id: string;
  owner_id: string;
  subscription_id: string;
  old_amount: number;
  new_amount: number;
  effective_on: string;
  notes: string | null;
  created_at: string;
}
