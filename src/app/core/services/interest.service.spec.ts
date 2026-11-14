import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InterestDisposal, InterestEntry } from '../models/domain.models';
import { AuthService } from './auth.service';
import { InterestService } from './interest.service';
import { SupabaseService } from './supabase.service';

describe('InterestService', () => {
  let service: InterestService;
  let mockSupabase: any;

  const entry = (overrides: Partial<InterestEntry> = {}): InterestEntry => ({
    id: 'entry-1',
    owner_id: 'u1',
    bank_account_id: 'bank-1',
    occurred_on: '2026-11-01',
    amount: 100,
    stage: 'received',
    separated_on: null,
    notes: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });

  const disposal = (overrides: Partial<InterestDisposal> = {}): InterestDisposal => ({
    id: 'disp-1',
    owner_id: 'u1',
    entry_id: 'entry-1',
    occurred_on: '2026-11-05',
    amount: 40,
    recipient: 'Masjid',
    purpose: 'Building fund',
    notes: null,
    created_at: '2026-11-05T00:00:00.000Z',
    updated_at: '2026-11-05T00:00:00.000Z',
    ...overrides,
  });

  const seed = (entries: InterestEntry[], disposals: InterestDisposal[] = []): void => {
    (service as any)._entries.set(entries);
    (service as any)._disposals.set(disposals);
  };

  beforeEach(() => {
    mockSupabase = { client: { from: jasmine.createSpy() } };

    TestBed.configureTestingModule({
      providers: [
        InterestService,
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            user: signal({ id: 'u1' }),
          },
        },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });

    service = TestBed.inject(InterestService);
  });

  it('keeps interest totals separate: received, separated, disposed, pending', () => {
    seed(
      [
        entry({ id: 'e1', amount: 100, stage: 'received' }),
        entry({ id: 'e2', amount: 50, stage: 'separated', separated_on: '2026-11-03' }),
        entry({ id: 'e3', amount: 60, stage: 'disposed', separated_on: '2026-11-02' }),
      ],
      [disposal({ id: 'd1', entry_id: 'e3', amount: 60 })],
    );

    expect(service.totalReceived()).toBe(210);
    expect(service.totalSeparated()).toBe(110); // separated + disposed entries
    expect(service.totalDisposed()).toBe(60);
    expect(service.pendingBalance()).toBe(150); // received − disposed
  });

  it('never reports a negative pending balance', () => {
    seed([entry({ amount: 50 })], [disposal({ amount: 80 })]);
    expect(service.pendingBalance()).toBe(0);
  });

  it('rejects a duplicate interest entry before touching the database', async () => {
    seed([entry()]);

    await expectAsync(
      service.createEntry({
        bank_account_id: 'bank-1',
        amount: 100,
        occurred_on: '2026-11-01',
      }),
    ).toBeRejectedWithError(
      'A matching interest entry already exists for this date, account, and amount.',
    );
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('allows the same amount on a different date (not a duplicate)', async () => {
    seed([entry()]);
    const query: any = {};
    query.insert = jasmine.createSpy('insert').and.returnValue(query);
    query.select = jasmine.createSpy('select').and.returnValue(query);
    query.single = jasmine.createSpy('single').and.resolveTo({
      data: entry({ id: 'entry-2', occurred_on: '2026-12-01' }),
      error: null,
    });
    mockSupabase.client.from.and.returnValue(query);

    const created = await service.createEntry({
      bank_account_id: 'bank-1',
      amount: 100,
      occurred_on: '2026-12-01',
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith('interest_entries');
    expect(created.id).toBe('entry-2');
    expect(service.entries().length).toBe(2);
  });

  it('blocks a disposal above the entry’s remaining interest', async () => {
    seed([entry({ amount: 100 })], [disposal({ amount: 70 })]);

    await expectAsync(
      service.recordDisposal({
        entry_id: 'entry-1',
        amount: 40,
      }),
    ).toBeRejectedWithError(
      'Disposal cannot exceed the remaining interest of ₹30.00 for this entry.',
    );
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('marks an entry disposed once disposals fully cover it', async () => {
    seed([entry({ amount: 100 })], [disposal({ amount: 60 })]);

    const query: any = {};
    query.insert = jasmine.createSpy('insert').and.returnValue(query);
    query.select = jasmine.createSpy('select').and.returnValue(query);
    query.single = jasmine.createSpy('single').and.resolveTo({
      data: disposal({ id: 'disp-2', amount: 40 }),
      error: null,
    });
    query.update = jasmine.createSpy('update').and.returnValue(query);
    query.eq = jasmine.createSpy('eq').and.returnValue(query);
    mockSupabase.client.from.and.returnValue(query);

    await service.recordDisposal({
      entry_id: 'entry-1',
      amount: 40,
      occurred_on: '2026-11-10',
      notes: 'Orphanage education fund',
    });

    expect(service.entries()[0].stage).toBe('disposed');
    expect(service.remainingForEntry(service.entries()[0])).toBe(0);
    expect(service.totalDisposed()).toBe(100);
    expect(service.pendingBalance()).toBe(0);
  });

  it('deletes an entry together with its disposal records (cascade)', async () => {
    seed([entry()], [disposal()]);

    const query: any = {};
    query.delete = jasmine.createSpy('delete').and.returnValue(query);
    query.eq = jasmine.createSpy('eq').and.returnValue(query);
    mockSupabase.client.from.and.returnValue(query);

    await service.deleteEntry('entry-1');

    expect(mockSupabase.client.from).toHaveBeenCalledWith('interest_entries');
    expect(service.entries().length).toBe(0);
    expect(service.disposals().length).toBe(0);
  });

  it('builds monthly summaries keyed by year-month', () => {
    seed(
      [
        entry({ id: 'e1', occurred_on: '2026-11-01', amount: 100 }),
        entry({ id: 'e2', occurred_on: '2026-10-15', amount: 50 }),
        entry({ id: 'e3', occurred_on: '2025-12-31', amount: 30 }),
      ],
      [disposal({ occurred_on: '2026-11-20', amount: 40 })],
    );

    const monthly = service.monthlySummaries();
    expect(monthly.map((row) => row.key)).toEqual(['2026-11', '2026-10', '2025-12']);
    expect(monthly[0]).toEqual(
      jasmine.objectContaining({ label: 'Nov 2026', received: 100, disposed: 40, pending: 60 }),
    );

    const yearly = service.yearlySummaries();
    expect(yearly.map((row) => row.key)).toEqual(['2026', '2025']);
    expect(yearly[0]).toEqual(
      jasmine.objectContaining({ label: '2026', received: 150, disposed: 40, pending: 110 }),
    );
  });
});
