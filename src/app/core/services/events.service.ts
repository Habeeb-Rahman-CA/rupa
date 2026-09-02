import { Injectable, effect, inject, signal } from '@angular/core';
import {
  EventExpense,
  EventParticipant,
  EventRecord,
  EventSettlement,
  Transaction,
} from '../models/domain.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { PeopleService } from './people.service';

export interface ParticipantWithMeta {
  id: string;               // event_participants.id
  personId: string | null;  // null when is_you
  name: string;             // "You" or person.name
  isYou: boolean;
  totalShare: number;       // sum of (expense.amount / participant_count) across expenses they joined
  isSettled: boolean;       // has a settlement row (paid in full)
}

export interface ExpenseWithParticipants {
  id: string;
  description: string;
  amount: number;
  paidOn: string;
  transactionId: string;
  participantIds: string[]; // event_participants.id[]
  perHead: number;          // amount / participantIds.length
}

export interface EventDetail {
  event: EventRecord;
  participants: ParticipantWithMeta[];
  expenses: ExpenseWithParticipants[];
  settlements: EventSettlement[];
  totalSpent: number;
  totalOutstanding: number;
}

export interface CreateEventInput {
  name: string;
  starts_on: string;
  ends_on?: string | null;
  kind?: string | null;
  notes?: string | null;
  participantPersonIds: string[]; // people already known (excluding you)
}

export interface AddExpenseInput {
  eventId: string;
  description: string;
  amount: number;
  paid_on?: string;
  participantIds: string[]; // event_participants.id[]
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly txService = inject(TransactionsService);
  private readonly peopleService = inject(PeopleService);

  private readonly _events = signal<EventRecord[]>([]);
  private readonly _currentDetail = signal<EventDetail | null>(null);
  private readonly _isLoading = signal(false);

  readonly events = this._events.asReadonly();
  readonly currentDetail = this._currentDetail.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.loadList();
      } else {
        this._events.set([]);
        this._currentDetail.set(null);
      }
    });
  }

  // ---------- list ----------------------------------------------------------

  async loadList(): Promise<void> {
    this._isLoading.set(true);
    const { data, error } = await this.supabase.client
      .from('events')
      .select('*')
      .order('starts_on', { ascending: false });
    this._isLoading.set(false);
    if (error) {
      console.error('Failed to load events', error);
      return;
    }
    this._events.set((data ?? []) as EventRecord[]);
  }

  async create(input: CreateEventInput): Promise<EventRecord> {
    const ownerId = this.requireUserId();
    if (!input.name.trim()) throw new Error('Event name is required.');

    const { data, error } = await this.supabase.client
      .from('events')
      .insert({
        owner_id: ownerId,
        name: input.name.trim(),
        kind: input.kind?.trim() || null,
        starts_on: input.starts_on,
        ends_on: input.ends_on || null,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to create event', error);
      throw error;
    }
    const evt = data as EventRecord;

    // Add "you" as a participant
    const rows: Array<{ event_id: string; person_id: string | null; is_you: boolean }> = [
      { event_id: evt.id, person_id: null, is_you: true },
    ];
    for (const pid of input.participantPersonIds) {
      rows.push({ event_id: evt.id, person_id: pid, is_you: false });
    }
    const { error: pErr } = await this.supabase.client
      .from('event_participants')
      .insert(rows);
    if (pErr) {
      console.error('Failed to add participants', pErr);
      throw pErr;
    }

    this._events.update((list) => [evt, ...list]);
    return evt;
  }

  async delete(id: string): Promise<void> {
    // Fetch all linked transaction ids first so we can clean them up.
    // event_expenses and event_settlements both hold transaction_id refs.
    const { data: expRows } = await this.supabase.client
      .from('event_expenses')
      .select('transaction_id')
      .eq('event_id', id);
    const { data: setRows } = await this.supabase.client
      .from('event_settlements')
      .select('transaction_id')
      .eq('event_id', id);

    const txIds = new Set<string>([
      ...(expRows ?? []).map((r) => r.transaction_id as string),
      ...(setRows ?? []).map((r) => r.transaction_id as string),
    ]);

    // Cascade will remove participants/expenses/expense_participants/settlements.
    const { error } = await this.supabase.client.from('events').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete event', error);
      throw error;
    }
    for (const txId of txIds) {
      await this.supabase.client.from('transactions').delete().eq('id', txId);
    }

    this._events.update((list) => list.filter((e) => e.id !== id));
    if (this._currentDetail()?.event.id === id) this._currentDetail.set(null);
    await this.txService.refresh();
  }

  async setStatus(id: string, status: 'open' | 'settled'): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('events')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Failed to update event status', error);
      throw error;
    }
    const updated = data as EventRecord;
    this._events.update((list) => list.map((e) => (e.id === id ? updated : e)));
    const cur = this._currentDetail();
    if (cur?.event.id === id) {
      this._currentDetail.set({ ...cur, event: updated });
    }
  }

  // ---------- detail --------------------------------------------------------

  async loadDetail(eventId: string): Promise<void> {
    this._isLoading.set(true);
    try {
      const [eventRes, partRes, expRes, expPartRes, setRes] = await Promise.all([
        this.supabase.client.from('events').select('*').eq('id', eventId).single(),
        this.supabase.client
          .from('event_participants')
          .select('*')
          .eq('event_id', eventId),
        this.supabase.client
          .from('event_expenses')
          .select('*')
          .eq('event_id', eventId)
          .order('paid_on', { ascending: false }),
        this.supabase.client
          .from('event_expense_participants')
          .select('event_expense_id, event_participant_id')
          .in(
            'event_expense_id',
            (
              await this.supabase.client
                .from('event_expenses')
                .select('id')
                .eq('event_id', eventId)
            ).data?.map((r) => r.id) ?? [],
          ),
        this.supabase.client
          .from('event_settlements')
          .select('*')
          .eq('event_id', eventId),
      ]);

      if (eventRes.error) throw eventRes.error;
      if (partRes.error) throw partRes.error;
      if (expRes.error) throw expRes.error;
      if (expPartRes.error) throw expPartRes.error;
      if (setRes.error) throw setRes.error;

      const detail = this.assembleDetail(
        eventRes.data as EventRecord,
        (partRes.data ?? []) as EventParticipant[],
        (expRes.data ?? []) as EventExpense[],
        (expPartRes.data ?? []) as Array<{
          event_expense_id: string;
          event_participant_id: string;
        }>,
        (setRes.data ?? []) as EventSettlement[],
      );
      this._currentDetail.set(detail);
    } catch (err) {
      console.error('Failed to load event detail', err);
      this._currentDetail.set(null);
    } finally {
      this._isLoading.set(false);
    }
  }

  clearDetail(): void {
    this._currentDetail.set(null);
  }

  // ---------- participants --------------------------------------------------

  async addParticipant(eventId: string, personId: string): Promise<void> {
    const { error } = await this.supabase.client.from('event_participants').insert({
      event_id: eventId,
      person_id: personId,
      is_you: false,
    });
    if (error) {
      console.error('Failed to add participant', error);
      throw error;
    }
    await this.loadDetail(eventId);
  }

  async removeParticipant(eventParticipantId: string): Promise<void> {
    const eventId = this._currentDetail()?.event.id;
    const { error } = await this.supabase.client
      .from('event_participants')
      .delete()
      .eq('id', eventParticipantId);
    if (error) {
      console.error('Failed to remove participant', error);
      throw error;
    }
    if (eventId) await this.loadDetail(eventId);
  }

  // ---------- expenses ------------------------------------------------------

  async addExpense(input: AddExpenseInput): Promise<void> {
    const ownerId = this.requireUserId();
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    if (input.participantIds.length === 0) {
      throw new Error('Pick at least one participant.');
    }
    const paidOn = input.paid_on ?? todayIso();

    // 1. Ledger transaction (out)
    const tx = await this.insertTransaction({
      owner_id: ownerId,
      amount: input.amount,
      direction: 'out',
      occurred_on: paidOn,
      notes: `Event expense: ${input.description}`,
      source: 'event',
      source_ref_id: input.eventId,
    });

    // 2. event_expenses row
    const { data: expRow, error: expErr } = await this.supabase.client
      .from('event_expenses')
      .insert({
        event_id: input.eventId,
        description: input.description.trim(),
        amount: input.amount,
        paid_on: paidOn,
        transaction_id: tx.id,
      })
      .select()
      .single();
    if (expErr) {
      console.error('Failed to create event expense', expErr);
      await this.txService.delete(tx.id).catch(() => undefined);
      throw expErr;
    }
    const expense = expRow as EventExpense;

    // 3. per-expense participants
    const partRows = input.participantIds.map((pid) => ({
      event_expense_id: expense.id,
      event_participant_id: pid,
    }));
    const { error: linkErr } = await this.supabase.client
      .from('event_expense_participants')
      .insert(partRows);
    if (linkErr) {
      console.error('Failed to link expense participants', linkErr);
      throw linkErr;
    }

    await this.loadDetail(input.eventId);
    await this.txService.refresh();
  }

  async removeExpense(expenseId: string): Promise<void> {
    const detail = this._currentDetail();
    const exp = detail?.expenses.find((e) => e.id === expenseId);
    if (!exp || !detail) return;

    // Cascade removes event_expense_participants.
    const { error } = await this.supabase.client
      .from('event_expenses')
      .delete()
      .eq('id', expenseId);
    if (error) {
      console.error('Failed to delete expense', error);
      throw error;
    }
    // The linked transaction has ON DELETE RESTRICT — remove it now.
    await this.supabase.client.from('transactions').delete().eq('id', exp.transactionId);

    await this.loadDetail(detail.event.id);
    await this.txService.refresh();
  }

  // ---------- settlements ---------------------------------------------------

  async settleParticipant(eventParticipantId: string): Promise<void> {
    const ownerId = this.requireUserId();
    const detail = this._currentDetail();
    if (!detail) throw new Error('No event loaded.');
    const p = detail.participants.find((x) => x.id === eventParticipantId);
    if (!p) throw new Error('Participant not found.');
    if (p.isYou) throw new Error("You can't settle yourself.");
    if (p.isSettled) return;
    if (p.totalShare <= 0) throw new Error('Nothing to settle.');

    const paidOn = todayIso();

    const tx = await this.insertTransaction({
      owner_id: ownerId,
      amount: p.totalShare,
      direction: 'in',
      occurred_on: paidOn,
      notes: `Settlement from ${p.name} for event`,
      source: 'event',
      source_ref_id: detail.event.id,
    });

    const { error } = await this.supabase.client.from('event_settlements').insert({
      event_id: detail.event.id,
      event_participant_id: eventParticipantId,
      paid_on: paidOn,
      transaction_id: tx.id,
    });
    if (error) {
      console.error('Failed to record settlement', error);
      await this.txService.delete(tx.id).catch(() => undefined);
      throw error;
    }

    await this.loadDetail(detail.event.id);
    await this.txService.refresh();
  }

  async unsettleParticipant(eventParticipantId: string): Promise<void> {
    const detail = this._currentDetail();
    if (!detail) return;
    const settlement = detail.settlements.find(
      (s) => s.event_participant_id === eventParticipantId,
    );
    if (!settlement) return;

    const { error } = await this.supabase.client
      .from('event_settlements')
      .delete()
      .eq('id', settlement.id);
    if (error) {
      console.error('Failed to remove settlement', error);
      throw error;
    }
    await this.supabase.client
      .from('transactions')
      .delete()
      .eq('id', settlement.transaction_id);

    await this.loadDetail(detail.event.id);
    await this.txService.refresh();
  }

  // ---------- helpers -------------------------------------------------------

  private assembleDetail(
    event: EventRecord,
    participants: EventParticipant[],
    expenses: EventExpense[],
    expenseParticipants: Array<{
      event_expense_id: string;
      event_participant_id: string;
    }>,
    settlements: EventSettlement[],
  ): EventDetail {
    // Map expense id → participant ids
    const partsByExpense = new Map<string, string[]>();
    for (const ep of expenseParticipants) {
      const arr = partsByExpense.get(ep.event_expense_id) ?? [];
      arr.push(ep.event_participant_id);
      partsByExpense.set(ep.event_expense_id, arr);
    }

    const expensesOut: ExpenseWithParticipants[] = expenses.map((e) => {
      const partIds = partsByExpense.get(e.id) ?? [];
      const perHead = partIds.length > 0 ? Number(e.amount) / partIds.length : 0;
      return {
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        paidOn: e.paid_on,
        transactionId: e.transaction_id,
        participantIds: partIds,
        perHead: round2(perHead),
      };
    });

    // Per participant: total share across expenses they joined
    const shareBy = new Map<string, number>();
    for (const exp of expensesOut) {
      for (const pid of exp.participantIds) {
        shareBy.set(pid, round2((shareBy.get(pid) ?? 0) + exp.perHead));
      }
    }

    // Person name lookup
    const people = this.peopleService.people();
    const nameOf = (personId: string | null): string =>
      people.find((p) => p.id === personId)?.name ?? 'Unknown';

    const settledSet = new Set(settlements.map((s) => s.event_participant_id));

    const participantsOut: ParticipantWithMeta[] = participants.map((p) => ({
      id: p.id,
      personId: p.person_id,
      name: p.is_you ? 'You' : nameOf(p.person_id),
      isYou: p.is_you,
      totalShare: shareBy.get(p.id) ?? 0,
      isSettled: settledSet.has(p.id),
    }));

    // Sort: You first, then alphabetical
    participantsOut.sort((a, b) => {
      if (a.isYou) return -1;
      if (b.isYou) return 1;
      return a.name.localeCompare(b.name);
    });

    const totalSpent = round2(
      expensesOut.reduce((s, e) => s + e.amount, 0),
    );
    const totalOutstanding = round2(
      participantsOut
        .filter((p) => !p.isYou && !p.isSettled)
        .reduce((s, p) => s + p.totalShare, 0),
    );

    return {
      event,
      participants: participantsOut,
      expenses: expensesOut,
      settlements,
      totalSpent,
      totalOutstanding,
    };
  }

  private async insertTransaction(payload: Record<string, unknown>): Promise<Transaction> {
    const { data, error } = await this.supabase.client
      .from('transactions')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('Failed to insert linked transaction', error);
      throw error;
    }
    return data as Transaction;
  }

  private requireUserId(): string {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Not signed in.');
    return id;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
