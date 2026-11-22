import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Event,
  EventParticipant,
  EventExpense,
  EventExpenseParticipant,
  EventSettlement,
} from '../src/events/events.entity.js';
import { EventsService } from '../src/events/events.service.js';import { TransactionsService } from '../src/transactions/transactions.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('EventsService (unit)', () => {
  let service: EventsService;
  let eventRepo: any;
  let participantRepo: any;
  let expenseRepo: any;
  let expenseParticipantRepo: any;
  let settlementRepo: any;
  let dataSource: any;
  let manager: any;
  let transactionsService: any;

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const eventId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      findOne: vi.fn(),
      find: vi.fn(),
      save: vi.fn(),
      create: vi.fn((_: any, data: any) => data),
      remove: vi.fn(),
      query: vi.fn(),
    };

    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    eventRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn(), remove: vi.fn() };
    participantRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    expenseRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn((d: any) => d) };
    expenseParticipantRepo = { create: vi.fn((d: any) => d), save: vi.fn() };
    settlementRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn((d: any) => d),
    };

    transactionsService = {
      createTransactionInManager: vi.fn(),
      deleteTransactionInManager: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(EventParticipant), useValue: participantRepo },
        { provide: getRepositoryToken(EventExpense), useValue: expenseRepo },
        { provide: getRepositoryToken(EventExpenseParticipant), useValue: expenseParticipantRepo },
        { provide: getRepositoryToken(EventSettlement), useValue: settlementRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = module.get(EventsService);
    (service as any).dataSource = dataSource;
    (service as any).transactionsService = transactionsService;
    (service as any).eventRepository = eventRepo;
    (service as any).participantRepository = participantRepo;
    (service as any).expenseRepository = expenseRepo;
    (service as any).expenseParticipantRepository = expenseParticipantRepo;
    (service as any).settlementRepository = settlementRepo;
  });

  describe('createEvent', () => {
    it('creates an open event scoped to the owner', async () => {
      eventRepo.create.mockImplementation((d: any) => d);
      eventRepo.save.mockImplementation(async (e: any) => ({ ...e, id: eventId }));
      eventRepo.findOne.mockResolvedValue({ id: eventId, owner_id: ownerId, name: 'Goa trip' });
      participantRepo.find.mockResolvedValue([]);
      expenseRepo.find.mockResolvedValue([]);
      settlementRepo.find.mockResolvedValue([]);

      const result = await service.createEvent(ownerId, { name: '  Goa trip  ' });

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ owner_id: ownerId, name: 'Goa trip', status: 'open' }),
      );
      expect(result.name).toBe('Goa trip');
      expect(result.owner_id).toBe(ownerId);
    });

    it('rejects an empty name', async () => {
      await expect(
        service.createEvent(ownerId, { name: '   ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getEvent', () => {
    it('returns the event when owned by the caller', async () => {
      eventRepo.findOne.mockResolvedValue({ id: eventId, owner_id: ownerId, name: 'Trip' });
      participantRepo.find.mockResolvedValue([]);
      expenseRepo.find.mockResolvedValue([]);
      settlementRepo.find.mockResolvedValue([]);

      const result = await service.getEvent(eventId, ownerId);
      expect(result.id).toBe(eventId);
      expect(eventRepo.findOne).toHaveBeenCalledWith({
        where: { id: eventId, owner_id: ownerId },
      });
    });

    it('throws NotFound for another user event', async () => {
      eventRepo.findOne.mockResolvedValue(null);
      await expect(service.getEvent(eventId, 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleteEvent', () => {
    it('reverts linked ledger rows before removing the event', async () => {
      const event = { id: eventId, owner_id: ownerId };
      // 1st findOne = event (locked), then expenses / settlements lookups.
      manager.findOne.mockResolvedValue(event);
      manager.find
        .mockResolvedValueOnce([{ id: 'ex1', transaction_id: 'tx-1' }])
        .mockResolvedValueOnce([{ id: 'st1', transaction_id: 'tx-2' }]);

      await service.deleteEvent(eventId, ownerId);

      expect(transactionsService.deleteTransactionInManager).toHaveBeenCalledTimes(2);
      expect(transactionsService.deleteTransactionInManager).toHaveBeenCalledWith(
        manager,
        'tx-1',
        ownerId,
      );
      expect(transactionsService.deleteTransactionInManager).toHaveBeenCalledWith(
        manager,
        'tx-2',
        ownerId,
      );
      expect(manager.remove).toHaveBeenCalledWith(event);
    });

    it('throws NotFound for another user event', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.deleteEvent(eventId, 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(manager.remove).not.toHaveBeenCalled();
    });
  });

  describe('addExpense', () => {
    it('creates an out transaction and splits across participants', async () => {
      manager.findOne.mockResolvedValue({ id: eventId, owner_id: ownerId });
      transactionsService.createTransactionInManager.mockResolvedValue({ id: 'tx-1' });
      manager.save.mockImplementation(async (row: any) => ({ ...row, id: 'exp-1' }));
      manager.find.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const result = await service.addExpense(eventId, ownerId, {
        description: 'Dinner',
        amount: 1200,
      });

      expect(transactionsService.createTransactionInManager).toHaveBeenCalledWith(
        manager,
        ownerId,
        expect.objectContaining({ amount: 1200, direction: 'out', source: 'event' }),
      );
      expect(result.amount).toBe(1200);
      expect(manager.save).toHaveBeenCalledTimes(3); // expense + 2 splits
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        service.addExpense(eventId, ownerId, { description: 'x', amount: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for another user event', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.addExpense(eventId, 'other-owner', { description: 'x', amount: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(transactionsService.createTransactionInManager).not.toHaveBeenCalled();
    });
  });

  describe('recordSettlement', () => {
    const dto = {
      event_expense_id: '33333333-3333-4333-8333-333333333333',
      event_participant_id: '44444444-4444-4444-8444-444444444444',
      amount: 400,
      direction: 'you_paid' as const,
    };

    it('reverses the previous settlement before applying the new one', async () => {
      const event = { id: eventId, owner_id: ownerId };
      const participant = { id: dto.event_participant_id, event_id: eventId };
      const previous = { id: 'set-1', transaction_id: 'tx-old' };

      manager.findOne
        .mockResolvedValueOnce(event) // event (locked)
        .mockResolvedValueOnce(participant) // participant belongs to event
        .mockResolvedValueOnce(previous); // existing settlement

      transactionsService.deleteTransactionInManager.mockResolvedValue(undefined);
      transactionsService.createTransactionInManager.mockResolvedValue({ id: 'tx-new' });
      manager.save.mockImplementation(async (row: any) => ({ ...row, id: 'set-2' }));

      await service.recordSettlement(eventId, ownerId, dto);

      expect(transactionsService.deleteTransactionInManager).toHaveBeenCalledWith(
        manager,
        'tx-old',
        ownerId,
      );
      expect(manager.remove).toHaveBeenCalledWith(previous);
      expect(transactionsService.createTransactionInManager).toHaveBeenCalledWith(
        manager,
        ownerId,
        expect.objectContaining({ amount: 400, direction: 'out', source: 'settlement' }),
      );
    });

    it('maps you_received to an incoming transaction', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: eventId, owner_id: ownerId })
        .mockResolvedValueOnce({ id: dto.event_participant_id, event_id: eventId })
        .mockResolvedValueOnce(null);
      transactionsService.createTransactionInManager.mockResolvedValue({ id: 'tx' });
      manager.save.mockImplementation(async (row: any) => ({ ...row, id: 'set-2' }));

      await service.recordSettlement(eventId, ownerId, { ...dto, direction: 'you_received' });

      expect(transactionsService.createTransactionInManager).toHaveBeenCalledWith(
        manager,
        ownerId,
        expect.objectContaining({ direction: 'in' }),
      );
    });

    it('rejects a participant from another event', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: eventId, owner_id: ownerId })
        .mockResolvedValueOnce(null);

      await expect(service.recordSettlement(eventId, ownerId, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transactionsService.createTransactionInManager).not.toHaveBeenCalled();
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        service.recordSettlement(eventId, ownerId, { ...dto, amount: -5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
