import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MoneyHeldPerson, MoneyHeldTransaction } from '../models/domain.models';
import { AuthService } from './auth.service';
import { BankAccountsService } from './bank-accounts.service';
import { MoneyHeldService } from './money-held.service';
import { PeopleService } from './people.service';
import { ApiService } from '../http/api.service';

describe('MoneyHeldService', () => {
  let service: MoneyHeldService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.resolveTo([]),
      post: jasmine.createSpy('post').and.resolveTo({}),
      delete: jasmine.createSpy('delete').and.resolveTo({}),
    };

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
        { provide: ApiService, useValue: mockApi },
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
  });
});
