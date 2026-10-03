export type TxDirection = 'in' | 'out';
export type TxSource = 'manual' | 'debt' | 'event' | 'opening';
export type CategoryKind = 'income' | 'expense' | 'savings';
export type DebtDirection = 'i_owe' | 'they_owe';
export type EventStatus = 'open' | 'settled';

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

export interface EventRecord {
  id: string;
  owner_id: string;
  name: string;
  kind: string | null;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  status: EventStatus;
  created_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  person_id: string | null;
  is_you: boolean;
}

export interface EventExpense {
  id: string;
  event_id: string;
  description: string;
  amount: number;
  paid_on: string;
  transaction_id: string;
}

export interface EventExpenseParticipant {
  id: string;
  event_expense_id: string;
  event_participant_id: string;
}

export interface EventSettlement {
  id: string;
  event_id: string;
  event_participant_id: string;
  paid_on: string;
  transaction_id: string;
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
