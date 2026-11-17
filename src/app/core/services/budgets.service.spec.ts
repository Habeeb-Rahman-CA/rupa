import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Budget, Transaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BudgetsService } from './budgets.service';
import { CategoriesService } from './categories.service';
import { SupabaseService } from './supabase.service';
import { TransactionsService } from './transactions.service';
import { periodRange, todayIso, toIsoDate } from '../../shared/utils/budget-utils';

interface QueryCall {
  table: string;
  op: string;
  args: unknown[];
}

describe('BudgetsService', () => {
  let service: BudgetsService;
  let authState: { isAuthenticated: any; user: any };
  let transactions: ReturnType<typeof signal<any[]>>;
  let categories: ReturnType<typeof signal<any[]>>;
  let queryCalls: QueryCall[];
  /** Per-chain result — resolved from the ops each builder chain ran. */
  let results: {
    select?: { data?: unknown; error?: unknown };
    insert?: { data?: unknown; error?: unknown };
    single?: { data?: unknown; error?: unknown };
    update?: { data?: unknown; error?: unknown };
    delete?: { data?: unknown; error?: unknown };
  };

  function makeQuery(table: string) {
    const q: any = {};
    const ops: string[] = [];
    const record =
      (op: string) =>
      (...args: unknown[]) => {
        ops.push(op);
        queryCalls.push({ table, op, args });
        return q;
      };
    for (const op of [
      'select',
      'order',
      'insert',
      'update',
      'delete',
      'eq',
      'single',
    ]) {
      q[op] = record(op);
    }
    q.then = (onFulfilled: any, onRejected: any) => {
      let result = results.select ?? { data: [], error: null };
      if (ops.includes('delete')) result = results.delete ?? { data: null, error: null };
      if (ops.includes('update')) result = results.update ?? { data: null, error: null };
      if (ops.includes('insert')) result = results.insert ?? { data: null, error: null };
      if (ops.includes('single')) result = results.single ?? { data: null, error: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return q;
  }

  function makeBudget(partial: Partial<Budget> & { id: string }): Budget {
    const today = todayIso();
    const month = periodRange('monthly', today);
    return {
      owner_id: 'owner',
      name: 'Food budget',
      category_id: 'food',
      amount: 500,
      period: 'monthly',
      start_date: month.start,
      end_date: month.end,
      recurring: false,
      thresholds: [50, 75, 90, 100],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...partial,
    };
  }

  function txn(partial: Partial<Transaction> & { id: string }): any {
    return {
      owner_id: 'owner',
      occurred_on: todayIso(),
      amount: 100,
      direction: 'out',
      category_id: 'food',
      notes: null,
      source: 'manual',
      source_ref_id: null,
      created_at: '2026-11-10T00:00:00.000Z',
      ...partial,
    };
  }

  function setBudgets(list: Budget[]): void {
    (service as any)._budgets.set(list);
  }

  beforeEach(() => {
    queryCalls = [];
    results = {};
    authState = {
      isAuthenticated: signal(false),
      user: signal({ id: 'owner' }),
    };
    transactions = signal<any[]>([]);
    categories = signal<any[]>([
      { id: 'food', name: 'Food', kind: 'expense' },
      { id: 'fuel', name: 'Fuel', kind: 'expense' },
      { id: 'salary', name: 'Salary', kind: 'income' },
    ]);

    TestBed.configureTestingModule({
      providers: [
        BudgetsService,
        { provide: AuthService, useValue: authState },
        {
          provide: TransactionsService,
          // Budgets read the unpaginated stats dataset; alias the same signal
          // so the mock covers both names.
          useValue: { transactions, statsTransactions: transactions },
        },
        {
          provide: CategoriesService,
          useValue: { categories },
        },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: jasmine.createSpy('from').and.callFake((table: string) =>
                makeQuery(table),
              ),
            },
          },
        },
      ],
    });

    service = TestBed.inject(BudgetsService);
  });

  // -------------------------------------------------------------------- load

  it('loads budgets from the table when signed in', async () => {
    authState.isAuthenticated.set(true);
    results.select = {
      data: [makeBudget({ id: 'b1' }), makeBudget({ id: 'b2', name: 'Rent budget' })],
      error: null,
    };

    await service.load();

    expect(service.budgets().map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(service.isLoading()).toBeFalse();
  });

  it('clears budgets when signed out', async () => {
    setBudgets([makeBudget({ id: 'b1' })]);

    await service.load(); // not authenticated

    expect(service.budgets()).toEqual([]);
    expect(queryCalls).toEqual([]); // no database round-trip
  });

  // --------------------------------------------------------------- roll-over

  it('rolls an expired recurring budget into the period containing today', async () => {
    authState.isAuthenticated.set(true);
    const today = todayIso();
    const previous = periodRange('monthly', today);
    // Build an expired monthly period: the month before the current one.
    const [py, pm] = previous.start.split('-').map(Number);
    const prevStart = toIsoDate(new Date(py, pm - 2, 1));
    const prevEnd = toIsoDate(new Date(py, pm - 1, 0));

    results.select = {
      data: [
        makeBudget({
          id: 'old',
          start_date: prevStart,
          end_date: prevEnd,
          recurring: true,
        }),
      ],
      error: null,
    };
    const createdRow = makeBudget({
      id: 'new',
      start_date: previous.start,
      end_date: previous.end,
      recurring: true,
    });
    results.single = { data: createdRow, error: null };

    await service.load();

    const insert = queryCalls.find((c) => c.op === 'insert');
    expect(insert).toBeDefined();
    const row = insert!.args[0] as Record<string, unknown>;
    expect(row['start_date']).toBe(previous.start);
    expect(row['end_date']).toBe(previous.end);
    expect(row['name']).toBe('Food budget');
    expect(row['owner_id']).toBe('owner');

    // Old row stays as history, new period is prepended.
    expect(service.budgets().length).toBe(2);
    expect(service.budgets()[0].id).toBe('new');
  });

  it('never duplicates a roll-over when the next period already exists', async () => {
    authState.isAuthenticated.set(true);
    const today = todayIso();
    const current = periodRange('monthly', today);
    const [cy, cm] = current.start.split('-').map(Number);
    const prevStart = toIsoDate(new Date(cy, cm - 2, 1));
    const prevEnd = toIsoDate(new Date(cy, cm - 1, 0));

    results.select = {
      data: [
        makeBudget({ id: 'old', start_date: prevStart, end_date: prevEnd, recurring: true }),
        makeBudget({ id: 'existing', start_date: current.start, end_date: current.end }),
      ],
      error: null,
    };

    await service.load();

    expect(queryCalls.some((c) => c.op === 'insert')).toBeFalse();
    expect(service.budgets().length).toBe(2);
  });

  it('leaves expired one-time budgets alone', async () => {
    authState.isAuthenticated.set(true);
    results.select = {
      data: [
        makeBudget({
          id: 'once',
          start_date: '2020-01-01',
          end_date: '2020-01-31',
          recurring: false,
        }),
      ],
      error: null,
    };

    await service.load();

    expect(queryCalls.some((c) => c.op === 'insert')).toBeFalse();
    expect(service.budgets().length).toBe(1);
  });

  // ----------------------------------------------------------------- create

  it('creates a budget for the signed-in owner and prepends it', async () => {
    setBudgets([makeBudget({ id: 'b1' })]);
    results.single = { data: makeBudget({ id: 'b2', name: 'Fuel budget' }), error: null };

    const created = await service.create({
      name: 'Fuel budget',
      category_id: 'fuel',
      amount: 200,
      period: 'weekly',
      start_date: '2026-11-09',
      end_date: '2026-11-15',
      recurring: false,
      thresholds: [50, 100],
    });

    expect(created.id).toBe('b2');
    expect(service.budgets().map((b) => b.id)).toEqual(['b2', 'b1']);

    const insert = queryCalls.find((c) => c.op === 'insert');
    const row = insert!.args[0] as Record<string, unknown>;
    expect(row['owner_id']).toBe('owner');
    expect(row['amount']).toBe(200);
    expect(row['thresholds']).toEqual([50, 100]);
  });

  it('rejects creating a budget when signed out', async () => {
    authState.user.set(null); // signed out → no user id

    await expectAsync(
      service.create({
        name: 'X',
        category_id: null,
        amount: 1,
        period: 'monthly',
        start_date: '2026-11-01',
        end_date: '2026-11-30',
        recurring: false,
        thresholds: [],
      }),
    ).toBeRejectedWithError('Not signed in.');
    expect(queryCalls).toEqual([]);
  });

  // ----------------------------------------------------------------- update

  it('applies a patch to the local row after a successful save', async () => {
    setBudgets([makeBudget({ id: 'b1', amount: 500 })]);
    results.update = { data: null, error: null };

    await service.update('b1', { amount: 750 });

    expect(service.budgets()[0].amount).toBe(750);
    const call = queryCalls.find((c) => c.op === 'update');
    expect(call).toBeDefined();
    expect(call!.table).toBe('budgets');
  });

  // ----------------------------------------------------------------- delete

  it('removes the row optimistically on a successful delete', async () => {
    setBudgets([makeBudget({ id: 'b1' }), makeBudget({ id: 'b2' })]);
    results.delete = { data: null, error: null };

    await service.delete('b1');

    expect(service.budgets().map((b) => b.id)).toEqual(['b2']);
  });

  it('restores the row at its old position when the delete fails', async () => {
    setBudgets([makeBudget({ id: 'b1' }), makeBudget({ id: 'b2' })]);
    results.delete = { data: null, error: { message: 'row-level security denied' } };

    await expectAsync(service.delete('b1')).toBeRejected();

    expect(service.budgets().map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  // ------------------------------------------------------------------- rows

  it('computes spent, remaining, percent and tone for each budget', async () => {
    const today = todayIso();
    const month = periodRange('monthly', today);
    setBudgets([
      makeBudget({ id: 'b1', amount: 500, start_date: month.start, end_date: month.end }),
    ]);
    transactions.set([
      txn({ id: 't1', amount: 400, occurred_on: today, category_id: 'food' }),
      // Transfers and wallet recharges must never count as spending.
      txn({ id: 't2', amount: 9999, source: 'transfer' }),
      txn({ id: 't3', amount: 9999, source: 'wallet_recharge' }),
      // Outside the period.
      txn({ id: 't4', amount: 9999, occurred_on: '2000-01-01' }),
    ]);

    const [row] = service.rows();
    expect(row.spent).toBe(400);
    expect(row.remaining).toBe(100);
    expect(row.percent).toBe(80);
    expect(row.tone).toBe('warning');
    expect(row.phase).toBe('current');
  });

  it('flags overspending with a negative remaining and the "over" tone', async () => {
    const today = todayIso();
    const month = periodRange('monthly', today);
    setBudgets([
      makeBudget({ id: 'b1', amount: 300, start_date: month.start, end_date: month.end }),
    ]);
    transactions.set([txn({ id: 't1', amount: 450, occurred_on: today })]);

    const [row] = service.rows();
    expect(row.spent).toBe(450);
    expect(row.remaining).toBe(-150);
    expect(row.percent).toBe(150);
    expect(row.tone).toBe('over');
  });

  it('counts wallet spending and nets refunds', async () => {
    const today = todayIso();
    const month = periodRange('monthly', today);
    setBudgets([
      makeBudget({ id: 'b1', amount: 500, start_date: month.start, end_date: month.end }),
    ]);
    transactions.set([
      txn({ id: 't1', amount: 100, source: 'wallet_spend', occurred_on: today }),
      txn({ id: 't2', amount: 50, occurred_on: today }),
      txn({ id: 't3', amount: 30, direction: 'in', occurred_on: today }), // refund
    ]);

    const [row] = service.rows();
    expect(row.spent).toBe(120);
  });

  it('splits rows into current, upcoming and history by period', async () => {
    const today = todayIso();
    const month = periodRange('monthly', today);
    setBudgets([
      makeBudget({ id: 'current', start_date: month.start, end_date: month.end }),
      makeBudget({
        id: 'upcoming',
        start_date: '2999-01-01',
        end_date: '2999-01-31',
      }),
      makeBudget({
        id: 'past',
        start_date: '2020-01-01',
        end_date: '2020-01-31',
      }),
    ]);

    expect(service.activeRows().map((r) => r.budget.id)).toEqual(['current']);
    expect(service.upcomingRows().map((r) => r.budget.id)).toEqual(['upcoming']);
    expect(service.historyRows().map((r) => r.budget.id)).toEqual(['past']);
  });

  it('sums the overview across current budgets and counts overspending', async () => {
    const today = todayIso();
    const month = periodRange('monthly', today);
    setBudgets([
      // Distinct category scopes so no transaction counts toward two budgets.
      makeBudget({
        id: 'a',
        category_id: 'food',
        amount: 400,
        start_date: month.start,
        end_date: month.end,
      }),
      makeBudget({
        id: 'b',
        category_id: 'fuel',
        amount: 600,
        start_date: month.start,
        end_date: month.end,
      }),
      makeBudget({ id: 'c', amount: 999, start_date: '2999-01-01', end_date: '2999-12-31' }),
    ]);
    transactions.set([
      txn({ id: 't1', amount: 300, occurred_on: today, category_id: 'food' }),
      txn({ id: 't2', amount: 700, occurred_on: today, category_id: 'fuel' }),
    ]);

    const overview = service.overview();
    expect(overview.limit).toBe(1000);
    expect(overview.spent).toBe(1000);
    expect(overview.remaining).toBe(0);
    expect(overview.percent).toBe(100);
    expect(overview.tone).toBe('over');
    expect(overview.overCount).toBe(1); // budget b is at 116%
  });

  // --------------------------------------------------------------- spentIn

  it('spentIn applies the overall accounting rules to a date range', () => {
    transactions.set([
      txn({ id: 't1', amount: 100, occurred_on: '2026-11-05' }),
      txn({ id: 't2', amount: 500, occurred_on: '2026-11-06', source: 'transfer' }),
      txn({ id: 't3', amount: 20, occurred_on: '2026-12-01' }),
    ]);

    expect(service.spentIn('2026-11-01', '2026-11-30')).toBe(100);
  });
});
