import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Debt } from '../src/debts/debts.entity.js';
import { DebtPayment } from '../src/debts/debts.entity.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { DebtsService } from '../src/debts/debts.service.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { CreateDebtDto } from '../src/debts/dto/debt.dto.js';
import { AddPaymentDto } from '../src/debts/dto/debt.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('DebtsService (unit)', () => {
  let service: DebtsService;
  let debtRepo: any;
  let paymentRepo: any;
  let txRepo: any;
  let dataSource: any;
  let manager: any;
  let txService: any;

  const ownerId = 'owner-7777-7777-7777-777777777777';

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      query: vi.fn(),
    };

    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    txService = {
      create: vi.fn(),
      linkTransactionToDebt: vi.fn(),
    };

    debtRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      manager: { update: vi.fn() },
    };
    paymentRepo = { create: vi.fn(), save: vi.fn() };
    txRepo = { find: vi.fn(), remove: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtsService,
        { provide: 'DebtRepository', useValue: debtRepo },
        { provide: 'DebtPaymentRepository', useValue: paymentRepo },
        { provide: 'TransactionRepository', useValue: txRepo },
        { provide: TransactionsService, useValue: txService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(DebtsService);
    (service as any).debtRepository = debtRepo;
    (service as any).debtPaymentRepository = paymentRepo;
    (service as any).transactionRepository = txRepo;
    (service as any).transactionsService = txService;
    (service as any).dataSource = dataSource;
  });

  const baseDebt: Debt = {
    id: 'd-1',
    owner_id: ownerId,
    person_id: 'person-1',
    direction: 'they_owe',
    principal: 1000,
    outstanding: 1000,
    reason: 'Loan',
    opened_on: new Date('2026-11-01'),
    closed_on: null,
    created_at: new Date(),
  };

  describe('createDebt', () => {
    it('creates a debt with an income transaction and links it', async () => {
      txService.create.mockResolvedValue({ id: 'tx-1' } as any);
      const created = { ...baseDebt, id: 'd-2' };
      debtRepo.create.mockReturnValue(created);
      debtRepo.save.mockResolvedValue(created);
      txService.linkTransactionToDebt.mockResolvedValue(undefined);

      const result = await service.createDebt(ownerId, {
        person_id: 'person-1',
        direction: 'they_owe',
        amount: 1000,
        impact: 'income',
      } as CreateDebtDto);

      expect(txService.create).toHaveBeenCalledWith(
        ownerId,
        expect.objectContaining({ source: 'debt', direction: 'in', amount: 1000 }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Transaction,
        { id: 'tx-1' },
        { source_ref_id: 'd-2' },
      );
      expect(result.outstanding).toBe(1000);
    });

    it('creates a debt with no transaction when impact is none', async () => {
      txService.create.mockResolvedValue({ id: 'tx-1' } as any);
      const created = { ...baseDebt, id: 'd-3' };
      debtRepo.create.mockReturnValue(created);
      debtRepo.save.mockResolvedValue(created);

      await service.createDebt(ownerId, {
        person_id: 'person-1',
        direction: 'they_owe',
        amount: 1000,
        impact: 'none',
      } as CreateDebtDto);

      expect(txService.create).not.toHaveBeenCalled();
    });

    it('rejects non-positive amount', async () => {
      await expect(
        service.createDebt(ownerId, {
          person_id: 'person-1',
          direction: 'they_owe',
          amount: 0,
        } as CreateDebtDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('addPayment', () => {
    it('records a payment, reduces outstanding, and closes debt at zero', async () => {
      const debt = { ...baseDebt, outstanding: 500 };
      manager.findOne.mockResolvedValue(debt);
      txService.create.mockResolvedValue({ id: 'tx-pay' } as any);
      paymentRepo.create.mockReturnValue({ id: 'pay-1' });
      paymentRepo.save.mockResolvedValue(undefined);
      manager.save.mockResolvedValue(debt);

      await service.addPayment(ownerId, 'd-1', {
        amount: 500,
      } as AddPaymentDto);

      expect(txService.create).toHaveBeenCalledWith(
        ownerId,
        expect.objectContaining({ source: 'debt', direction: 'in', amount: 500, source_ref_id: 'd-1' }),
      );
      expect(debt.outstanding).toBe(0);
      expect(debt.closed_on).not.toBeNull();
    });

    it('rejects payment larger than outstanding', async () => {
      const debt = { ...baseDebt, outstanding: 100 };
      manager.findOne.mockResolvedValue(debt);
      await expect(
        service.addPayment(ownerId, 'd-1', { amount: 500 } as AddPaymentDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for missing debt', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.addPayment(ownerId, 'd-9', { amount: 100 } as AddPaymentDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteDebt', () => {
    it('deletes linked transactions and the debt', async () => {
      const debt = { ...baseDebt };
      manager.findOne.mockResolvedValue(debt);
      manager.find.mockResolvedValue([{ id: 'tx-1' } as Transaction]);
      manager.remove.mockResolvedValue(undefined);

      await service.deleteDebt('d-1', ownerId);

      expect(manager.remove).toHaveBeenCalledWith({ id: 'tx-1' } as Transaction);
      expect(manager.remove).toHaveBeenCalledWith(debt);
    });

    it('throws NotFound for another user debt', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.deleteDebt('d-1', 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
