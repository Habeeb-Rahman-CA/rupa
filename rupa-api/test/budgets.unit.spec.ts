import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Budget } from '../src/budgets/budget.entity.js';
import { BudgetsService } from '../src/budgets/budgets.service.js';
import { Transaction } from '../src/transactions/transaction.entity.js';
import { CreateBudgetDto } from '../src/budgets/dto/budget.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BudgetsService (unit)', () => {
  let service: BudgetsService;
  let budgetRepo: any;
  let txRepo: any;

  const ownerId = 'owner-8888-8888-8888-888888888888';

  beforeEach(async () => {
    vi.clearAllMocks();

    budgetRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    };
    const qb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ spent: '0' }),
    };
    txRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(qb),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        { provide: 'BudgetRepository', useValue: budgetRepo },
        { provide: 'TransactionRepository', useValue: txRepo },
      ],
    }).compile();

    service = module.get(BudgetsService);
    (service as any).budgetRepository = budgetRepo;
    (service as any).transactionRepository = txRepo;
  });

  const baseBudget: Budget = {
    id: 'b-1',
    owner_id: ownerId,
    name: 'Groceries',
    category_id: 'cat-1',
    amount: 1000,
    period: 'monthly',
    start_date: new Date('2026-11-01'),
    end_date: new Date('2026-11-30'),
    recurring: false,
    thresholds: [50, 75, 90, 100],
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('listBudgets', () => {
    it('computes spent/remaining/status per budget', async () => {
      budgetRepo.find.mockResolvedValue([baseBudget]);
      const qb = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ spent: '300' }),
      };
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listBudgets(ownerId);

      expect(result).toHaveLength(1);
      expect(result[0].spent).toBe(300);
      expect(result[0].remaining).toBe(700);
      expect(result[0].percentage).toBe(30);
      expect(result[0].status).toBe('on_track');
    });

    it('returns exceeded status when spent >= amount', async () => {
      budgetRepo.find.mockResolvedValue([baseBudget]);
      const qb = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ spent: '1000' }),
      };
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listBudgets(ownerId);
      expect(result[0].status).toBe('exceeded');
    });
  });

  describe('createBudget', () => {
    it('creates a budget', async () => {
      const created = { ...baseBudget, id: 'b-2' };
      budgetRepo.create.mockReturnValue(created);
      budgetRepo.save.mockResolvedValue(created);

      const result = await service.createBudget(ownerId, {
        name: 'Groceries',
        amount: 1000,
      } as CreateBudgetDto);

      expect(budgetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Groceries', amount: 1000 }),
      );
      expect(result.amount).toBe(1000);
    });

    it('rejects end date before start date', async () => {
      await expect(
        service.createBudget(ownerId, {
          name: 'Bad',
          amount: 100,
          start_date: '2026-11-10',
          end_date: '2026-11-01',
        } as CreateBudgetDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateBudget', () => {
    it('updates an owned budget', async () => {
      const updated = { ...baseBudget, name: 'Dining' };
      budgetRepo.findOne.mockResolvedValue(baseBudget);
      budgetRepo.save.mockResolvedValue(updated);

      const result = await service.updateBudget('b-1', ownerId, {
        name: 'Dining',
      } as CreateBudgetDto);

      expect(result.name).toBe('Dining');
    });

    it('throws NotFound for another user budget', async () => {
      budgetRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateBudget('b-1', 'other-owner', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteBudget', () => {
    it('deletes an owned budget', async () => {
      budgetRepo.findOne.mockResolvedValue(baseBudget);
      budgetRepo.remove.mockResolvedValue(undefined);
      await service.deleteBudget('b-1', ownerId);
      expect(budgetRepo.remove).toHaveBeenCalledWith(baseBudget);
    });

    it('throws NotFound when missing', async () => {
      budgetRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteBudget('b-9', ownerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
