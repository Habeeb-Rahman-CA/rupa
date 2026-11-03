import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MoneyHeldPerson, MoneyHeldTransaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { MoneyHeldService } from './money-held.service';
import { PeopleService } from './people.service';
import { SupabaseService } from './supabase.service';

describe('MoneyHeldService', () => {
  let service: MoneyHeldService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = { client: { from: jasmine.createSpy() } };

    TestBed.configureTestingModule({
      providers: [
        MoneyHeldService,
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            user: signal({ id: 'u1' }),
          },
        },
        { provide: SupabaseService, useValue: mockSupabase },
        {
          provide: PeopleService,
          useValue: {
            people: signal([{ id: 'person-1', name: 'Aisha' }]),
          },
        },
        {
          provide: BankAccountsService,
          useValue: {
            bankAccounts: signal([]),
            update: jasmine.createSpy().and.resolveTo(),
          },
        },
      ],
    });

    service = TestBed.inject(MoneyHeldService);
  });

  it('calculates each outstanding balance from received and returned records', () => {
    const heldPerson: MoneyHeldPerson = {
      id: 'held-1',
      owner_id: 'u1',
      person_id: 'person-1',
      created_at: '',
    };
    const records: MoneyHeldTransaction[] = [
      {
        id: 'received-1',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'received',
        amount: 250,
        occurred_on: '2026-11-01',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: 'Deposit',
        created_at: '',
      },
      {
        id: 'returned-1',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'returned',
        amount: 75,
        occurred_on: '2026-11-02',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: null,
        created_at: '',
      },
    ];

    (service as any)._heldPeople.set([heldPerson]);
    (service as any)._transactions.set(records);

    expect(service.balances()).toEqual([
      jasmine.objectContaining({
        name: 'Aisha',
        received: 250,
        returned: 75,
        outstanding: 175,
        records,
      }),
    ]);
    expect(service.totalHeld()).toBe(175);
    expect(service.peopleCount()).toBe(1);
  });

  it('rejects a return larger than the calculated outstanding balance', async () => {
    (service as any)._heldPeople.set([
      { id: 'held-1', owner_id: 'u1', person_id: 'person-1', created_at: '' },
    ]);
    (service as any)._transactions.set([
      {
        id: 'received-1',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'received',
        amount: 100,
        occurred_on: '2026-11-01',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: null,
        created_at: '',
      },
    ]);

    await expectAsync(
      service.record({
        held_person_id: 'held-1',
        direction: 'returned',
        amount: 100.01,
      }),
    ).toBeRejectedWithError('Return amount cannot exceed the outstanding balance.');

    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('writes received records to the separate money-held ledger', async () => {
    (service as any)._heldPeople.set([
      { id: 'held-1', owner_id: 'u1', person_id: 'person-1', created_at: '' },
    ]);
    const created: MoneyHeldTransaction = {
      id: 'received-2',
      owner_id: 'u1',
      held_person_id: 'held-1',
      direction: 'received',
      amount: 80,
      occurred_on: '2026-11-02',
      payment_mode: 'cash',
      bank_account_id: null,
      notes: 'For tickets',
      created_at: '',
    };
    const query: any = {};
    query.insert = jasmine.createSpy().and.returnValue(query);
    query.select = jasmine.createSpy().and.returnValue(query);
    query.single = jasmine.createSpy().and.resolveTo({ data: created, error: null });
    mockSupabase.client.from.and.returnValue(query);

    await service.record({
      held_person_id: 'held-1',
      direction: 'received',
      amount: 80,
      occurred_on: '2026-11-02',
      notes: 'For tickets',
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith('money_held_transactions');
    expect(service.transactions()[0]).toEqual(created);
  });

  it('allows deleting a receipt when the remaining receipts still cover returns', async () => {
    (service as any)._heldPeople.set([
      { id: 'held-1', owner_id: 'u1', person_id: 'person-1', created_at: '' },
    ]);
    const records: MoneyHeldTransaction[] = [
      {
        id: 'received-1',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'received',
        amount: 100,
        occurred_on: '2026-11-01',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: null,
        created_at: '',
      },
      {
        id: 'received-2',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'received',
        amount: 50,
        occurred_on: '2026-11-02',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: null,
        created_at: '',
      },
      {
        id: 'returned-1',
        owner_id: 'u1',
        held_person_id: 'held-1',
        direction: 'returned',
        amount: 100,
        occurred_on: '2026-11-03',
        payment_mode: 'cash',
        bank_account_id: null,
        notes: null,
        created_at: '',
      },
    ];
    (service as any)._transactions.set(records);

    const query: any = {};
    query.delete = jasmine.createSpy().and.returnValue(query);
    query.eq = jasmine.createSpy().and.resolveTo({ data: null, error: null });
    mockSupabase.client.from.and.returnValue(query);

    await service.delete(records[1]);

    expect(query.delete).toHaveBeenCalled();
    expect(service.transactions().map((record) => record.id)).toEqual([
      'received-1',
      'returned-1',
    ]);
  });
});
