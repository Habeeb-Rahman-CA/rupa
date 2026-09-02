export type TxDirection = 'in' | 'out';
export type TxSource = 'manual' | 'debt' | 'event';
export type CategoryKind = 'income' | 'expense';
export type DebtDirection = 'i_owe' | 'they_owe';
export type EventStatus = 'open' | 'settled';

export interface Category {
  id: string;
  owner_id: string;
  name: string;
  kind: CategoryKind;
  created_at: string;
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
