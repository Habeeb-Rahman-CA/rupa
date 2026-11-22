import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { CreateTransactionDto } from '../src/transactions/dto/transaction.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('TransactionsService (unit)', () => {
  let service: TransactionsService;
  let txRepo: any;
  let baRepo: any;
  let dataSource: any;
  let manager: any;

  const ownerId = 'owner-3333-3333-3333-333333333333';

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

    txRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), createQueryBuilder: vi.fn() };
    baRepo = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: 'TransactionRepository', useValue: txRepo },
        { provide: 'BankAccountRepository', useValue: baRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TransactionsService);
    (service as any).transactionRepository = txRepo;
    (service as any).bankAccountRepository = baRepo;
    (service as any).dataSource = dataSource;
  });

  const baseTx: Transaction = {
    id: 't-1',
    owner_id: ownerId,
    occurred_on: new Date('2026-11-20'),
    amount: 1000,
    direction: 'in',
    category_id: null,
    notes: null,
    source: 'manual',
    source_ref_id: null,
    payment_mode: 'cash',
    bank_account_id: null,
    wallet_id: null,
    created_at: new Date(),
  };

  describe('list', () => {
    it('returns owner transactions ordered by occurred_on desc', async () => {
      txRepo.createQueryBuilder.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([baseTx]),
      });

      const result = await service.list(ownerId, 50);
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1000);
    });
  });

  describe('create', () => {
    const dto: CreateTransactionDto = {
      amount: 500,
      direction: 'out',
      payment_mode: 'bank',
      bank_account_id: 'ba-1',
    };

    it('creates a transaction and debits the bank account', async () => {
      txRepo.createQueryBuilder.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      });
      const account = { ...baseTx, id: 'ba-1', balance: 2000, owner_id: ownerId, is_primary: true } as any;
      baRepo.findOne.mockResolvedValue(account);
      manager.findOne.mockResolvedValue(account);
      manager.create.mockReturnValue({ ...baseTx, id: 't-2', amount: 500 });
      manager.save.mockResolvedValue({ ...baseTx, id: 't-2', amount: 500, balance: 1500 });

      const result = await service.create(ownerId, dto);

      expect(manager.create).toHaveBeenCalledWith(
        Transaction,
        expect.objectContaining({ payment_mode: 'bank', bank_account_id: 'ba-1', amount: 500 }),
      );
      // Bank balance debited for 'out'
      expect(account.balance).toBe(1500);
      expect(manager.save).toHaveBeenCalledWith(account);
      expect(result.amount).toBe(500);
    });

    it('rejects non-positive amount', async () => {
      await expect(
        service.create(ownerId, { ...dto, amount: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('delete', () => {
    it('reverts a bank "in" transaction (decreases balance) before deleting', async () => {
      const current = { ...baseTx, id: 't-1', direction: 'in', amount: 1000, payment_mode: 'bank', bank_account_id: 'ba-1' };
      manager.findOne.mockResolvedValue(current);
      const account = { ...current, id: 'ba-1', balance: 3000 } as any;
      manager.findOne.mockResolvedValueOnce(current).mockResolvedValueOnce(account);
      manager.remove.mockResolvedValue(undefined);

      await service.delete('t-1', ownerId);

      // Removing an 'in' decreases balance by amount
      expect(account.balance).toBe(2000);
      expect(manager.remove).toHaveBeenCalledWith(current);
    });

    it('throws NotFound for another user transaction', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.delete('t-1', 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects linked transfer transactions', async () => {
      const linked = { ...baseTx, id: 't-1', source: 'transfer' } as Transaction;
      manager.findOne.mockResolvedValue(linked);
      await expect(service.delete('t-1', ownerId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('assignToAccount', () => {
    it('assigns unassigned bank transactions to the account', async () => {
      manager.findOne.mockResolvedValue({ id: 'ba-1', owner_id: ownerId } as BankAccount);
      manager.query.mockResolvedValue(undefined);

      await service.assignToAccount(ownerId, 'ba-1', ['t-1', 't-2']);

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('update public.transactions'),
        expect.anything(),
      );
    });
  });
});
