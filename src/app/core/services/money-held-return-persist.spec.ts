import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MoneyHeldPerson, MoneyHeldTransaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { MoneyHeldService } from './money-held.service';
import { PeopleService } from './people.service';
import { SupabaseService } from './supabase.service';

/**
 * Regression tests for "a Money Held return disappears and the card balance
 * reverts a few seconds later".
 *
 * Two independent failure modes are covered:
 *
 *  1. Lost updates — a `load()` whose SELECT was issued *before* a write
 *     resolves *after* it and overwrites the newer local state with a stale
 *     server snapshot, making the saved record vanish and the balance jump
 *     back.
 *  2. Duplicated writes — a record that reached the database but lost its
 *     response is retried (by the user tapping Save again) and inserted a
 *     second time.
 */

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Drain every pending microtask (and one macrotask boundary). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

type Row = Record<string, any>;

interface FakeDb {
  tables: Record<string, Row[]>;
  /**
   * Per-table gates. `select` delays the response *after* the row snapshot has
   * been taken (so the payload is stale), `insert` delays the write itself.
   */
  gates: Record<string, { select?: Promise<void>; insert?: Promise<void> }>;
  /** Simulates a write that reached the database but lost its response. */
  failInsertOnce?: boolean;
}

function createFakeSupabase(db: FakeDb) {
  const rowsOf = (table: string): Row[] => db.tables[table] ?? (db.tables[table] = []);

  const client = {
    from(table: string) {
      const q: any = {
        op: 'select' as 'select' | 'insert' | 'update' | 'delete',
        insertPayload: null as Row | null,
        patch: null as Row | null,
        filters: [] as Array<{ col: string; value: any; negate: boolean }>,

        select: () => q,
        order: () => q,
        insert(payload: Row) {
          q.op = 'insert';
          q.insertPayload = payload;
          return q;
        },
        update(patch: Row) {
          q.op = 'update';
          q.patch = patch;
          return q;
        },
        delete: () => {
          q.op = 'delete';
          return q;
        },
        eq(col: string, value: any) {
          q.filters.push({ col, value, negate: false });
          return q;
        },
        neq(col: string, value: any) {
          q.filters.push({ col, value, negate: true });
          return q;
        },

        // A query is "sent" when awaited — that is when PostgREST would
        // evaluate it, so the snapshot is taken here.
        then: (onOk: any, onErr: any) =>
          Promise.resolve()
            .then(() => run())
            .then(onOk, onErr),
        single: () => Promise.resolve().then(() => (q.op === 'insert' ? run() : singleRow())),
      };

      function matches(row: Row): boolean {
        return q.filters.every((f: any) => {
          const eq = row[f.col] === f.value;
          return f.negate ? !eq : eq;
        });
      }

      function applyInsert(): { data: Row | null; error: any } {
        const payload = { ...q.insertPayload };
        const existing = rowsOf(table).find((row) => row['id'] === payload['id']);
        if (existing) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        rowsOf(table).push(payload);
        if (db.failInsertOnce) {
          db.failInsertOnce = false;
          return { data: null, error: { message: 'TypeError: Failed to fetch' } };
        }
        return { data: { ...payload }, error: null };
      }

      function singleRow(): { data: Row | null; error: any } {
        const matched = rowsOf(table).filter(matches);
        if (matched.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        }
        return { data: { ...matched[0] }, error: null };
      }

      function run(): { data: any; error: any } | Promise<{ data: any; error: any }> {
        if (q.op === 'insert') {
          const gate = db.gates[table]?.insert;
          return gate ? gate.then(applyInsert) : applyInsert();
        }

        if (q.op === 'update') {
          rowsOf(table)
            .filter(matches)
            .forEach((row) => Object.assign(row, q.patch));
          return { data: null, error: null };
        }

        if (q.op === 'delete') {
          db.tables[table] = rowsOf(table).filter((row) => !matches(row));
          return { data: null, error: null };
        }

        // select: snapshot first, then wait — this is what makes the response
        // stale relative to a write that lands meanwhile.
        const snapshot = rowsOf(table).filter(matches).map((row) => ({ ...row }));
        const gate = db.gates[table]?.select;
        if (gate) {
          return gate.then(() => ({ data: snapshot, error: null }));
        }
        return { data: snapshot, error: null };
      }

      return q;
    },
  };

  return { client };
}

const HELD_PERSON: MoneyHeldPerson = {
  id: 'held-1',
  owner_id: 'u1',
  person_id: 'person-1',
  created_at: '2026-11-01T00:00:00.000Z',
};

const RECEIVED: MoneyHeldTransaction = {
  id: 'received-1',
  owner_id: 'u1',
  held_person_id: 'held-1',
  direction: 'received',
  amount: 200,
  occurred_on: '2026-11-01',
  payment_mode: 'cash',
  bank_account_id: null,
  notes: null,
  created_at: '2026-11-01T00:00:00.000Z',
};

const RETURN_ID = '11111111-1111-4111-8111-111111111111';

describe('money-held returns persist correctly', () => {
  describe('MoneyHeldService', () => {
    let service: MoneyHeldService;
    let db: FakeDb;
    let bankAccounts: any;
    let bankUpdates: number;
    let failBalanceOnce: boolean;

    beforeEach(() => {
      db = { tables: {}, gates: {} };
      db.tables['money_held_people'] = [{ ...HELD_PERSON }];
      db.tables['money_held_transactions'] = [{ ...RECEIVED }];
      bankUpdates = 0;

      bankAccounts = signal([
        { id: 'card-1', balance: 1000, bank_name: 'HDFC', is_primary: true },
      ]);

      const fake = createFakeSupabase(db);

      TestBed.configureTestingModule({
        providers: [
          MoneyHeldService,
          {
            provide: AuthService,
            useValue: { isAuthenticated: signal(true), user: signal({ id: 'u1' }) },
          },
          { provide: SupabaseService, useValue: fake },
          {
            provide: PeopleService,
            useValue: { people: signal([{ id: 'person-1', name: 'Aisha' }]) },
          },
          {
            provide: BankAccountsService,
            useValue: {
              bankAccounts,
              update: jasmine.createSpy('update').and.callFake((id: string, changes: any) => {
                bankUpdates += 1;
                bankAccounts.update((list: { id: string }[]) =>
                  list.map((account: { id: string }) =>
                    account.id === id ? { ...account, ...changes } : account,
                  ),
                );
                return Promise.resolve(null);
              }),
            },
          },
        ],
      });

      service = TestBed.inject(MoneyHeldService);
      (service as any)._heldPeople.set([{ ...HELD_PERSON }]);
      (service as any)._transactions.set([{ ...RECEIVED }]);
    });

    const returns = () => service.transactions().filter((r) => r.direction === 'returned');
    const storedReturns = () =>
      db.tables['money_held_transactions'].filter((r: any) => r.direction === 'returned');
    const recordReturn = (id?: string) =>
      service.record({
        id,
        held_person_id: 'held-1',
        direction: 'returned',
        amount: 50,
        occurred_on: '2026-11-10',
        payment_mode: 'bank',
        bank_account_id: 'card-1',
      });

    it('keeps a saved return when a background load resolves after it', async () => {
      const selectGate = deferred();
      const insertGate = deferred();
      db.gates['money_held_transactions'] = {
        select: selectGate.promise,
        insert: insertGate.promise,
      };

      // A sync whose SELECT snapshot is taken before the write lands.
      const backgroundLoad = service.load();
      const pendingRecord = recordReturn();

      // Let the background SELECT be issued (and snapshot) while the insert
      // is still in flight.
      await flush();

      insertGate.resolve();
      await pendingRecord;

      // The slow SELECT now comes back with pre-write state.
      selectGate.resolve();
      await backgroundLoad;

      expect(returns().length).toBe(1);
      expect(returns()[0].amount).toBe(50);
      expect(bankAccounts()[0].balance).toBe(950);
      expect(bankUpdates).toBe(1);
    });

    it('does not insert the row twice when a save is retried after a lost response', async () => {
      db.failInsertOnce = true;

      await expectAsync(recordReturn(RETURN_ID)).toBeRejected();
      expect(storedReturns().length).toBe(1);
      expect(bankUpdates).toBe(0);

      // The user taps Save again with the same id.
      await recordReturn(RETURN_ID);

      expect(storedReturns().length).toBe(1);
      expect(returns().length).toBe(1);
      expect(bankUpdates).toBe(1);
      expect(bankAccounts()[0].balance).toBe(950);
    });
  });

  describe('BankAccountsService', () => {
    let service: BankAccountsService;
    let db: FakeDb;

    beforeEach(() => {
      db = { tables: {}, gates: {} };
      db.tables['bank_accounts'] = [
        {
          id: 'card-1',
          owner_id: 'u1',
          bank_name: 'HDFC',
          account_name: 'Primary',
          card_type: 'credit',
          payment_network: 'visa',
          card_number_masked: '4329',
          theme: 'blue',
          is_primary: true,
          balance: 1000,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ];
      localStorage.removeItem('rupa:u1:bank_accounts');

      const fake = createFakeSupabase(db);

      TestBed.configureTestingModule({
        providers: [
          BankAccountsService,
          {
            provide: AuthService,
            useValue: { isAuthenticated: signal(true), user: signal({ id: 'u1' }) },
          },
          { provide: SupabaseService, useValue: fake },
        ],
      });

      service = TestBed.inject(BankAccountsService);
    });

    it('does not revert a balance that was written while a load was in flight', async () => {
      await service.load();
      expect(service.bankAccounts()[0].balance).toBe(1000);

      const selectGate = deferred();
      db.gates['bank_accounts'] = { select: selectGate.promise };

      // A background refresh whose SELECT was issued before the write.
      const backgroundLoad = service.load();
      await flush();

      await service.update('card-1', { balance: 950 });
      expect(service.bankAccounts()[0].balance).toBe(950);

      selectGate.resolve();
      await backgroundLoad;

      expect(service.bankAccounts()[0].balance).toBe(950);
    });
  });
});
