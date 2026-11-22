import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InterestEntry, InterestDisposal } from '../src/interest/interest.entity.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { InterestService } from '../src/interest/interest.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('InterestService (unit)', () => {
  let service: InterestService;
  let entryRepo: any;
  let disposalRepo: any;
  let dataSource: any;
  let manager: any;
  let bankRepo: any;

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const accountId = '99999999-9999-4999-8999-999999999999';

  const entry = (over: Partial<InterestEntry> = {}): InterestEntry =>
    ({
      id: 'e1',
      owner_id: ownerId,
      bank_account_id: accountId,
      occurred_on: new Date('2026-01-01'),
      amount: 1000,
      stage: 'received',
      notes: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      ...over,
    }) as InterestEntry;

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((_: any, d: any) => d),
      remove: vi.fn(),
      query: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn(async (cb: any) => cb(manager)),
      getRepository: vi.fn(() => bankRepo),
    };

    entryRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn((d: any) => d), remove: vi.fn() };
    disposalRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn((d: any) => d), remove: vi.fn() };
    bankRepo = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterestService,
        { provide: getRepositoryToken(InterestEntry), useValue: entryRepo },
        { provide: getRepositoryToken(InterestDisposal), useValue: disposalRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(InterestService);
    (service as any).dataSource = dataSource;
    (service as any).entryRepository = entryRepo;
    (service as any).disposalRepository = disposalRepo;
  });

  describe('createEntry', () => {
    it('creates an entry for an owned bank account', async () => {
      bankRepo.findOne.mockResolvedValue({ id: accountId, owner_id: ownerId });
      entryRepo.findOne.mockResolvedValue(null);
      entryRepo.save.mockImplementation(async (e: any) => ({ ...e, id: 'e1' }));

      const result = await service.createEntry(ownerId, {
        bank_account_id: accountId,
        amount: 250.5,
        notes: '  Q3 credit  ',
      });

      expect(bankRepo.findOne).toHaveBeenCalledWith({
        where: { id: accountId, owner_id: ownerId },
      });
      expect(result.amount).toBe(250.5);
      expect(result.notes).toBe('Q3 credit');
      expect(result.stage).toBe('received');
    });

    it('rejects a bank account owned by another user', async () => {
      bankRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createEntry(ownerId, { bank_account_id: accountId, amount: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(entryRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate credit', async () => {
      bankRepo.findOne.mockResolvedValue({ id: accountId, owner_id: ownerId });
      entryRepo.findOne.mockResolvedValue(entry());
      await expect(
        service.createEntry(ownerId, { bank_account_id: accountId, amount: 1000 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a unique-violation race to 409', async () => {
      bankRepo.findOne.mockResolvedValue({ id: accountId, owner_id: ownerId });
      entryRepo.findOne.mockResolvedValue(null);
      entryRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        service.createEntry(ownerId, { bank_account_id: accountId, amount: 10 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        service.createEntry(ownerId, { bank_account_id: accountId, amount: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteEntry', () => {
    it('deletes an owned entry', async () => {
      entryRepo.findOne.mockResolvedValue(entry());
      await service.deleteEntry('e1', ownerId);
      expect(entryRepo.remove).toHaveBeenCalled();
    });

    it('throws NotFound for another user entry', async () => {
      entryRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteEntry('e1', 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('recordDisposal', () => {
    it('allocates FIFO across the oldest entries first', async () => {
      manager.query.mockResolvedValue(undefined);
      manager.find
        .mockResolvedValueOnce([
          entry({ id: 'e1', amount: 100, occurred_on: new Date('2026-01-01') }),
          entry({ id: 'e2', amount: 100, occurred_on: new Date('2026-02-01') }),
        ]) // entries
        .mockResolvedValueOnce([]); // existing disposals
      manager.save.mockImplementation(async (r: any) => ({ ...r, id: 'd1' }));

      const result = await service.recordDisposal(ownerId, { amount: 150 });

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(100); // e1 fully covered
      expect(result[1].amount).toBe(50); // e2 partially covered
      // e1 fully covered => moved to disposed.
      expect(
        manager.save.mock.calls.some(
          (c: any[]) => c[0].id === 'e1' && c[0].stage === 'disposed',
        ),
      ).toBe(true);
      // e2 only partially covered => stays received.
      expect(
        manager.save.mock.calls.some(
          (c: any[]) => c[0].id === 'e2' && c[0].stage === 'received',
        ),
      ).toBe(false);
    });

    it('rejects a disposal larger than the pending balance', async () => {
      manager.query.mockResolvedValue(undefined);
      manager.find
        .mockResolvedValueOnce([entry({ amount: 100 })])
        .mockResolvedValueOnce([{ entry_id: 'e1', amount: 40 }]);

      await expect(service.recordDisposal(ownerId, { amount: 70 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a non-positive amount before opening a transaction', async () => {
      await expect(service.recordDisposal(ownerId, { amount: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('never writes to transactions or bank balances', async () => {
      manager.query.mockResolvedValue(undefined);
      manager.find
        .mockResolvedValueOnce([entry({ amount: 100 })])
        .mockResolvedValueOnce([]);
      manager.save.mockImplementation(async (r: any) => ({ ...r, id: 'd1' }));

      await service.recordDisposal(ownerId, { amount: 100 });

      expect(manager.query.mock.calls.every((c: any[]) => !/insert into public\.transactions/i.test(String(c[0])))).toBe(true);
      expect(manager.save.mock.calls.every((c: any[]) => c[0].owner_id === ownerId)).toBe(true);
    });
  });

  describe('summary', () => {
    it('computes received, disposed and a non-negative pending balance', async () => {
      entryRepo.find.mockResolvedValue([entry({ amount: 500 }), entry({ amount: 300 })]);
      disposalRepo.find.mockResolvedValue([{ amount: 200 }]);

      const result = await service.summary(ownerId);
      expect(result.totalReceived).toBe(800);
      expect(result.totalDisposed).toBe(200);
      expect(result.pendingBalance).toBe(600);
    });

    it('never returns a negative pending balance', async () => {
      entryRepo.find.mockResolvedValue([entry({ amount: 100 })]);
      disposalRepo.find.mockResolvedValue([{ amount: 300 }]);

      const result = await service.summary(ownerId);
      expect(result.pendingBalance).toBe(0);
    });
  });

  describe('updateEntryStage', () => {
    it('updates an owned entry stage', async () => {
      entryRepo.findOne.mockResolvedValue(entry());
      entryRepo.save.mockImplementation(async (e: any) => e);
      const result = await service.updateEntryStage('e1', ownerId, 'separated');
      expect(result.stage).toBe('separated');
    });

    it('throws NotFound for another user entry', async () => {
      entryRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateEntryStage('e1', 'other', 'separated'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
