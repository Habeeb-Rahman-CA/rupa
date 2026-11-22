import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource as TypeOrmDataSource,
  Repository,
  EntityManager,
} from 'typeorm';
import { Event } from './events.entity.js';
import { EventParticipant } from './events.entity.js';
import { EventExpense } from './events.entity.js';
import { EventExpenseParticipant } from './events.entity.js';
import { EventSettlement } from './events.entity.js';
import {
  CreateEventDto,
  EventResponseDto,
  AddParticipantDto,
  EventParticipantResponseDto,
  AddExpenseDto,
  EventExpenseResponseDto,
  RecordSettlementDto,
  EventSettlementResponseDto,
} from './dto/event.dto.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
    @InjectRepository(EventExpense)
    private readonly expenseRepository: Repository<EventExpense>,
    @InjectRepository(EventExpenseParticipant)
    private readonly expenseParticipantRepository: Repository<EventExpenseParticipant>,
    @InjectRepository(EventSettlement)
    private readonly settlementRepository: Repository<EventSettlement>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
    @Inject(TransactionsService)
    private readonly transactionsService: TransactionsService,
  ) {}

  async listEvents(ownerId: string): Promise<EventResponseDto[]> {
    const events = await this.eventRepository.find({
      where: { owner_id: ownerId },
      order: { starts_on: 'ASC', created_at: 'DESC' },
    });
    return Promise.all(events.map((e) => this.toResponse(e, ownerId)));
  }

  async getEvent(id: string, ownerId: string): Promise<EventResponseDto> {
    const event = await this.eventRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    return this.toResponse(event, ownerId);
  }

  async createEvent(
    ownerId: string,
    dto: CreateEventDto,
  ): Promise<EventResponseDto> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Event name is required.');
    }
    const event = this.eventRepository.create({
      owner_id: ownerId,
      name,
      kind: dto.kind ? dto.kind.trim() : null,
      starts_on: dto.starts_on ? new Date(dto.starts_on) : new Date(TODAY()),
      ends_on: dto.ends_on ? new Date(dto.ends_on) : null,
      notes: dto.notes ? dto.notes.trim() : null,
      status: 'open',
    });
    const saved = await this.eventRepository.save(event);
    return this.toResponse(saved, ownerId);
  }

  async updateEvent(
    id: string,
    ownerId: string,
    dto: CreateEventDto,
  ): Promise<EventResponseDto> {
    const event = await this.eventRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Event name is required.');
    }
    event.name = name;
    event.kind = dto.kind ? dto.kind.trim() : null;
    event.starts_on = dto.starts_on ? new Date(dto.starts_on) : event.starts_on;
    event.ends_on = dto.ends_on ? new Date(dto.ends_on) : null;
    event.notes = dto.notes ? dto.notes.trim() : null;
    const saved = await this.eventRepository.save(event);
    return this.toResponse(saved, ownerId);
  }

  async deleteEvent(id: string, ownerId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) {
        throw new NotFoundException('Event not found.');
      }

      // Remove the linked ledger rows and revert their bank balance effects
      // first, so deleting an event can never leave orphaned transactions or
      // a balance that still reflects a spent/settled amount.
      const expenses = await manager.find(EventExpense, {
        where: { event_id: id },
      });
      for (const expense of expenses) {
        if (expense.transaction_id) {
          await this.transactionsService.deleteTransactionInManager(
            manager,
            expense.transaction_id,
            ownerId,
          );
        }
      }

      const settlements = await manager.find(EventSettlement, {
        where: { event_id: id },
      });
      for (const settlement of settlements) {
        if (settlement.transaction_id) {
          await this.transactionsService.deleteTransactionInManager(
            manager,
            settlement.transaction_id,
            ownerId,
          );
        }
      }

      await manager.remove(event);
    });
  }

  async addParticipant(
    eventId: string,
    ownerId: string,
    dto: AddParticipantDto,
  ): Promise<EventParticipantResponseDto> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    const participant = this.participantRepository.create({
      event_id: eventId,
      person_id: dto.person_id ?? null,
      is_you: dto.is_you ?? false,
    });
    const saved = await this.participantRepository.save(participant);
    return {
      id: saved.id,
      event_id: saved.event_id,
      person_id: saved.person_id,
      is_you: saved.is_you,
    };
  }

  async listParticipants(
    eventId: string,
    ownerId: string,
  ): Promise<EventParticipantResponseDto[]> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    const rows = await this.participantRepository.find({
      where: { event_id: eventId },
      order: { created_at: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      event_id: r.event_id,
      person_id: r.person_id,
      is_you: r.is_you,
    }));
  }

  async addExpense(
    eventId: string,
    ownerId: string,
    dto: AddExpenseDto,
  ): Promise<EventExpenseResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Expense amount must be greater than zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id: eventId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) {
        throw new NotFoundException('Event not found.');
      }

      const paidOn = dto.paid_on ?? TODAY();
      const notes = dto.description.trim();

      const tx = await this.transactionsService.createTransactionInManager(
        manager,
        ownerId,
        {
          amount,
          direction: 'out',
          occurred_on: paidOn,
          notes,
          source: 'event',
          source_ref_id: null,
          payment_mode: 'cash',
          bank_account_id: null,
        },
      );

      const expense = this.expenseRepository.create({
        event_id: eventId,
        description: dto.description.trim(),
        amount,
        paid_on: new Date(paidOn),
        transaction_id: tx.id,
      });
      const savedExpense = await manager.save(expense);

      // Split the expense across all participants of the event.
      const participants = await manager.find(EventParticipant, {
        where: { event_id: eventId },
      });
      for (const p of participants) {
        await manager.save(
          this.expenseParticipantRepository.create({
            event_expense_id: savedExpense.id,
            event_participant_id: p.id,
          }),
        );
      }

      return {
        id: savedExpense.id,
        event_id: savedExpense.event_id,
        description: savedExpense.description,
        amount: savedExpense.amount,
        paid_on: savedExpense.paid_on
          ? new Date(savedExpense.paid_on).toISOString().slice(0, 10)
          : '',
        transaction_id: savedExpense.transaction_id,
      };
    });
  }

  async listExpenses(
    eventId: string,
    ownerId: string,
  ): Promise<EventExpenseResponseDto[]> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    const rows = await this.expenseRepository.find({
      where: { event_id: eventId },
      order: { paid_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      event_id: r.event_id,
      description: r.description,
      amount: r.amount,
      paid_on: r.paid_on
        ? new Date(r.paid_on).toISOString().slice(0, 10)
        : '',
      transaction_id: r.transaction_id,
    }));
  }

  async recordSettlement(
    eventId: string,
    ownerId: string,
    dto: RecordSettlementDto,
  ): Promise<EventSettlementResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Settlement amount must be greater than zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id: eventId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) {
        throw new NotFoundException('Event not found.');
      }

      const paidOn = dto.paid_on ?? TODAY();
      const notes = dto.notes ? dto.notes.trim() : null;

      // The participant must belong to this event (prevents cross-event writes).
      const participant = await manager.findOne(EventParticipant, {
        where: { id: dto.event_participant_id, event_id: eventId },
      });
      if (!participant) {
        throw new NotFoundException('Event participant not found.');
      }

      // Settlements are one-per-participant ("paid-in-full only", enforced by
      // the unique index). Re-recording reverses the previous balance effect
      // before the new one is applied, so the ledger never double-counts.
      const existing = await manager.findOne(EventSettlement, {
        where: { event_id: eventId, event_participant_id: participant.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        await this.transactionsService.deleteTransactionInManager(
          manager,
          existing.transaction_id,
          ownerId,
        );
        await manager.remove(existing);
      }

      const direction =
        dto.direction === 'you_received' ? 'in' : 'out';
      const tx = await this.transactionsService.createTransactionInManager(
        manager,
        ownerId,
        {
          amount,
          direction,
          occurred_on: paidOn,
          notes,
          source: 'settlement',
          source_ref_id: null,
          payment_mode: dto.payment_mode ?? 'cash',
          bank_account_id: dto.bank_account_id ?? null,
        },
      );

      const settlement = this.settlementRepository.create({
        event_id: eventId,
        event_participant_id: dto.event_participant_id,
        paid_on: new Date(paidOn),
        transaction_id: tx.id,
      });
      const saved = await manager.save(settlement);

      return {
        id: saved.id,
        event_id: saved.event_id,
        event_participant_id: saved.event_participant_id,
        paid_on: saved.paid_on
          ? new Date(saved.paid_on).toISOString().slice(0, 10)
          : '',
        transaction_id: saved.transaction_id,
      };
    });
  }

  async listSettlements(
    eventId: string,
    ownerId: string,
  ): Promise<EventSettlementResponseDto[]> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, owner_id: ownerId },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    const rows = await this.settlementRepository.find({
      where: { event_id: eventId },
      order: { paid_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      event_id: r.event_id,
      event_participant_id: r.event_participant_id,
      paid_on: r.paid_on
        ? new Date(r.paid_on).toISOString().slice(0, 10)
        : '',
      transaction_id: r.transaction_id,
    }));
  }

  private async toResponse(event: Event, ownerId: string): Promise<EventResponseDto> {
    const participants = await this.listParticipants(event.id, ownerId);
    const expenses = await this.listExpenses(event.id, ownerId);
    const settlements = await this.listSettlements(event.id, ownerId);
    return {
      id: event.id,
      owner_id: event.owner_id,
      name: event.name,
      kind: event.kind,
      starts_on: event.starts_on
        ? new Date(event.starts_on).toISOString().slice(0, 10)
        : '',
      ends_on: event.ends_on
        ? new Date(event.ends_on).toISOString().slice(0, 10)
        : null,
      notes: event.notes,
      status: event.status,
      created_at: event.created_at,
      participants,
      expenses,
      settlements,
    };
  }
}
