import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountTransfer } from '../src/transfers/account-transfer.entity.js';
import { TransfersService } from '../src/transfers/transfers.service.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { CreateAccountTransferDto } from '../src/transfers/dto/transfer.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('TransfersService (unit)', () => {
  let service: TransfersService;
  let transferRepo: any;
  let baRepo: any;
  let dataSource: any;
  let manager: any;

  const ownerId = 'owner-5555-5555-5555-555555555555';

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      create: vi.fn(),
      save: vi.fn(),
      findOne: vi.fn(),
      remove: vi.fn(),
      query: vi.fn(),
    };

    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    transferRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    baRepo = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: 'AccountTransferRepository', useValue: transferRepo },
        { provide: 'BankAccountRepository', useValue: baRepo },
        { provide: 'TransactionRepository', useValue: { findOne: vi.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TransfersService);
    (service as any).transferRepository = transferRepo;
    (service as any).bankAccountRepository = baRepo;
    (service as any).dataSource = dataSource;
  });

  describe('listTransfers', () => {
    it('returns owner transfers ordered by date desc', async () => {
      transferRepo.find.mockResolvedValue([
        { id: 'tf-1', owner_id: ownerId, amount: 100, source_account_id: 'a', destination_account_id: 'b', occurred_on: new Date(), notes: null, debit_transaction_id: null, credit_transaction_id: null, created_at: new Date() },
      ]);
      const result = await service.listTransfers(ownerId);
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(100);
    });
  });

  describe('createTransfer', () => {
    const dto: CreateAccountTransferDto = {
      source_account_id: 'a-1',
      destination_account_id: 'a-2',
      amount: 300,
    };

    it('creates a transfer and debits source / credits destination', async () => {
      const rows = [{ count: '2' }];
      manager.query.mockResolvedValue(rows);
      const source = { id: 'a-1', balance: 1000, owner_id: ownerId } as any;
      const dest = { id: 'a-2', balance: 500, owner_id: ownerId } as any;
      manager.findOne.mockResolvedValue(source);
      const created = { id: 'tf-1', amount: 300, source_account_id: 'a-1', destination_account_id: 'a-2', occurred_on: new Date(), notes: null, debit_transaction_id: 'd', credit_transaction_id: 'c', created_at: new Date(), owner_id: ownerId };
      manager.findOne.mockResolvedValueOnce(source).mockResolvedValueOnce(created);
      manager.save = vi.fn();

      const result = await service.createTransfer(ownerId, dto);

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('order by id for update'),
        [ownerId, 'a-1', 'a-2'],
      );
      expect(result.amount).toBe(300);
    });

    it('rejects same source and destination', async () => {
      await expect(
        service.createTransfer(ownerId, { ...dto, destination_account_id: 'a-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects insufficient source balance', async () => {
      manager.query.mockResolvedValue([{ count: '2' }]);
      const poor = { id: 'a-1', balance: 10, owner_id: ownerId } as any;
      manager.findOne.mockResolvedValue(poor);
      await expect(service.createTransfer(ownerId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('deleteTransfer', () => {
    it('deletes an owned transfer', async () => {
      const current = {
        id: 'tf-1', owner_id: ownerId, source_account_id: 'a-1',
        destination_account_id: 'a-2', amount: 300,
        debit_transaction_id: 'd', credit_transaction_id: 'c',
      } as any;
      manager.findOne.mockResolvedValue(current);
      manager.query.mockResolvedValue(undefined);

      await service.deleteTransfer('tf-1', ownerId);

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('delete from public.transfers'),
        ['tf-1', ownerId],
      );
    });

    it('throws NotFound for another user transfer', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.deleteTransfer('tf-1', 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
