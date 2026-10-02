export type TxDirection = 'in' | 'out';
export type TxSource = 'manual' | 'debt' | 'event';
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

export function markAsSavingsCategory(id: string): void {
  if (typeof localStorage !== 'undefined' && id) {
    try {
      localStorage.setItem(SAVINGS_PREFIX + id, 'true');
    } catch {}
  }
}

export function isSavingsCategory(cat: Category | null | undefined): boolean {
  if (!cat) return false;
  if (cat.kind === 'savings') return true;
  if (typeof localStorage !== 'undefined' && cat.id) {
    if (localStorage.getItem(SAVINGS_PREFIX + cat.id) === 'true') return true;
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
