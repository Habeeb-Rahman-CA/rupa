import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Subscription } from '../src/subscriptions/subscriptions.entity.js';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import { CreateSubscriptionDto } from '../src/subscriptions/dto/subscription.dto.js';
import { RecordPaymentDto } from '../src/subscriptions/dto/subscription.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SubscriptionsService (unit)', () => {
  let service: SubscriptionsService;
  let subRepo: any;
  let payRepo: any;
  let renewalRepo: any;
  let priceChangeRepo: any;
  let dataSource: any;
  let manager: any;
  let txService: any;

  const ownerId = 'owner-9999-9999-9999-999999999999';

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      query: vi.fn(),
    };

    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    txService = {
      createTransactionInManager: vi.fn(),
    };

    subRepo = { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), save: vi.fn(), remove: vi.fn() };
    payRepo = { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), save: vi.fn() };
    renewalRepo = { find: vi.fn(), findOne: vi.fn() };
    priceChangeRepo = { find: vi.fn(), findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: 'SubscriptionRepository', useValue: subRepo },
        { provide: 'SubscriptionPaymentRepository', useValue: payRepo },
        { provide: 'SubscriptionRenewalRepository', useValue: renewalRepo },
        { provide: 'SubscriptionPriceChangeRepository', useValue: priceChangeRepo },
        { provide: TransactionsService, useValue: txService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
    (service as any).subscriptionRepository = subRepo;
    (service as any).paymentRepository = payRepo;
    (service as any).renewalRepository = renewalRepo;
    (service as any).priceChangeRepository = priceChangeRepo;
    (service as any).transactionsService = txService;
    (service as any).dataSource = dataSource;
  });

  const baseSub: Subscription = {
    id: 's-1',
    owner_id: ownerId,
    name: 'Netflix',
    category: 'Entertainment',
    amount: 14.99,
    billing_cycle: 'monthly',
    start_date: new Date('2026-11-01'),
    next_renewal_date: new Date('2026-12-01'),
    end_date: null,
    payment_account_id: null,
    auto_renewal: true,
    status: 'active',
    theme: 'slate',
    cancelled_on: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('listSubscriptions', () => {
    it('returns owner subscriptions ordered by next_renewal_date asc', async () => {
      subRepo.find.mockResolvedValue([baseSub]);
      const result = await service.listSubscriptions(ownerId);
      expect(subRepo.find).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
        order: { next_renewal_date: 'ASC', created_at: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
    });
  });

  describe('createSubscription', () => {
    it('creates a subscription', async () => {
      const created = { ...baseSub, id: 's-2' };
      subRepo.create.mockReturnValue(created);
      subRepo.save.mockResolvedValue(created);

      const result = await service.createSubscription(ownerId, {
        name: 'Netflix',
        amount: 14.99,
        billing_cycle: 'monthly',
      } as CreateSubscriptionDto);

      expect(subRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Netflix', amount: 14.99 }),
      );
      expect(result.amount).toBe(14.99);
    });

    it('rejects non-positive amount', async () => {
      await expect(
        service.createSubscription(ownerId, {
          name: 'X',
          amount: 0,
          billing_cycle: 'monthly',
        } as CreateSubscriptionDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordPayment', () => {
    it('records a payment and advances next_renewal_date', async () => {
      const sub = { ...baseSub, next_renewal_date: new Date('2026-12-01') };
      manager.findOne.mockResolvedValue(sub);
      txService.createTransactionInManager.mockResolvedValue({ id: 'tx-pay' } as any);
      manager.query.mockResolvedValue(undefined);
      manager.save.mockResolvedValue(sub);
      manager.findOne.mockResolvedValueOnce(sub).mockResolvedValueOnce({
        id: 'pay-1',
        renewal_id: 'r-1',
        owner_id: ownerId,
        subscription_id: 's-1',
        amount: 14.99,
        paid_on: new Date('2026-12-01'),
        transaction_id: 'tx-pay',
        notes: null,
        created_at: new Date(),
      } as any);

      const result = await service.recordPayment(ownerId, 's-1', {
        amount: 14.99,
        paid_on: '2026-12-01',
      } as RecordPaymentDto);

      expect(txService.createTransactionInManager).toHaveBeenCalledWith(
        manager,
        ownerId,
        expect.objectContaining({ source: 'subscription', direction: 'out', amount: 14.99 }),
      );
      expect(sub.next_renewal_date.getMonth()).toBe(0); // Jan 2027
      expect(result.amount).toBe(14.99);
    });

    it('throws NotFound for missing subscription', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.recordPayment(ownerId, 's-9', { amount: 10 } as RecordPaymentDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
