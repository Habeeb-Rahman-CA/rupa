import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ResetDataService, ResetGroupId } from './reset-data.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { STORAGE_PREFIX, DEVICE_KEYS, userKey } from '../config/storage-keys';

describe('ResetDataService', () => {
  let service: ResetDataService;
  let mockRpc: jasmine.Spy;
  let mockSignIn: jasmine.Spy;

  beforeEach(() => {
    mockRpc = jasmine.createSpy('rpc').and.resolveTo({ data: { tables: [] }, error: null });
    mockSignIn = jasmine
      .createSpy('signInWithPassword')
      .and.resolveTo({ data: { session: null }, error: null });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { rpc: mockRpc } },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'u1', email: 'user@example.com' }),
            signInWithPassword: mockSignIn,
          },
        },
      ],
    });

    service = TestBed.inject(ResetDataService);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ------------------------------------------------------- group catalogue

  it('exposes 12 unique groups', () => {
    expect(service.groups.length).toBe(12);
    const ids = service.groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(12);
  });

  // ---------------------------------------------------- dependency closure

  it('forces debts and transfers when the ledger is selected', () => {
    const result = service.expandSelection(['transactions']);
    expect(result).toEqual(new Set<ResetGroupId>(['transactions', 'debts', 'transfers']));
  });

  it('forces debts and money_held when people are selected', () => {
    const result = service.expandSelection(['people']);
    expect(result).toEqual(new Set<ResetGroupId>(['people', 'debts', 'money_held']));
  });

  it('forces transfers, interest and wallets when cards are selected', () => {
    const result = service.expandSelection(['cards']);
    expect(result).toEqual(new Set<ResetGroupId>(['cards', 'transfers', 'interest', 'wallets']));
  });

  it('leaves independent groups alone', () => {
    const result = service.expandSelection(['categories', 'budgets']);
    expect(result).toEqual(new Set<ResetGroupId>(['categories', 'budgets']));
  });

  it('deduplicates overlapping forced groups', () => {
    const result = service.expandSelection(['transactions', 'cards', 'people']);
    expect(result).toEqual(
      new Set<ResetGroupId>([
        'transactions',
        'cards',
        'people',
        'debts',
        'transfers',
        'interest',
        'wallets',
        'money_held',
      ]),
    );
  });

  it('is stable when applied twice', () => {
    const once = service.expandSelection(['cards']);
    const twice = service.expandSelection(once);
    expect(twice).toEqual(once);
  });

  it('flags only forced groups via isForced', () => {
    expect(service.isForced(['cards'], 'cards')).toBe(false);
    expect(service.isForced(['cards'], 'transfers')).toBe(true);
    expect(service.isForced(['cards'], 'interest')).toBe(true);
    expect(service.isForced(['cards'], 'wallets')).toBe(true);
    expect(service.isForced(['cards'], 'debts')).toBe(false);
  });

  // ------------------------------------------------------ password gate

  it('maps a wrong-password error to a friendly message', async () => {
    mockSignIn.and.resolveTo({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const result = await service.verifyPassword('nope');
    expect(result.ok).toBeFalse();
    expect(result.error).toBe('Incorrect password. Try again.');
    expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'nope');
  });

  it('passes other errors through errorText', async () => {
    mockSignIn.and.resolveTo({
      data: { session: null },
      error: { message: 'Network is offline' },
    });
    const result = await service.verifyPassword('pw');
    expect(result.ok).toBeFalse();
    expect(result.error).toBe('Network is offline');
  });

  it('resolves ok on success', async () => {
    const result = await service.verifyPassword('right');
    expect(result.ok).toBeTrue();
    expect(result.error).toBeUndefined();
  });

  // ----------------------------------------------------------- wipe RPC

  it('sends the selected groups to the reset_user_data RPC', async () => {
    await service.resetGroups(['transactions', 'debts']);
    expect(mockRpc).toHaveBeenCalledWith('reset_user_data', {
      p_tables: ['transactions', 'debts'],
    });
  });

  it('throws a readable error when the RPC fails', async () => {
    mockRpc.and.resolveTo({ data: null, error: { message: 'boom' } });
    await expectAsync(service.resetGroups(['cards'])).toBeRejectedWithError('boom');
  });

  // ------------------------------------------------------- device data

  it('clears user-scoped and device keys but keeps the session', () => {
    localStorage.setItem(userKey('u1', 'anything'), 'x');
    localStorage.setItem(userKey('u2', 'other-user'), 'keep-me');
    localStorage.setItem(DEVICE_KEYS.MPIN, '{}');
    localStorage.setItem(DEVICE_KEYS.THEME, 'dark');
    localStorage.setItem('rupa-auth', '{"session":true}');

    service.clearDeviceData();

    expect(localStorage.getItem(userKey('u1', 'anything'))).toBeNull();
    expect(localStorage.getItem(userKey('u2', 'other-user'))).toBe('keep-me');
    expect(localStorage.getItem(DEVICE_KEYS.MPIN)).toBeNull();
    expect(localStorage.getItem(DEVICE_KEYS.THEME)).toBeNull();
    expect(localStorage.getItem('rupa-auth')).toBe('{"session":true}');
    expect(localStorage.getItem(`${STORAGE_PREFIX}:theme`)).toBeNull();
  });
});
