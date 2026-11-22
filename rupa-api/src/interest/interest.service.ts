import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource as TypeOrmDataSource,
  Repository,
  In,
} from 'typeorm';
import { InterestEntry, InterestDisposal } from './interest.entity.js';
import {
  CreateInterestEntryDto,
  InterestEntryResponseDto,
  CreateInterestDisposalDto,
  InterestDisposalResponseDto,
  InterestSummaryDto,
} from './dto/interest.dto.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Interest (Riba) tracker service.
 *
 * Writes only to `interest_entries` / `interest_disposals` — never to
 * `transactions`, categories, or bank-account balances — so recorded interest
 * can never leak into personal income, expenses, savings, budgets, the
 * dashboard balance, or reports.
 *
 * Disposal amounts are allocated FIFO (oldest entry first) across the entries
 * that still have balance left, mirroring the client-side allocation the
 * Supabase app performed before the migration.
 */
@Injectable()
export class InterestService {
  private readonly logger = new Logger(InterestService.name);

  constructor(
    @InjectRepository(InterestEntry)
    private readonly entryRepository: Repository<InterestEntry>,
    @InjectRepository(InterestDisposal)
    private readonly disposalRepository: Repository<InterestDisposal>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
  ) {}

  async listEntries(ownerId: string): Promise<InterestEntryResponseDto[]> {
    const rows = await this.entryRepository.find({
      where: { owner_id: ownerId },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toEntryResponse(r));
  }

  async listDisposals(ownerId: string): Promise<InterestDisposalResponseDto[]> {
    const rows = await this.disposalRepository.find({
      where: { owner_id: ownerId },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toDisposalResponse(r));
  }

  async summary(ownerId: string): Promise<InterestSummaryDto> {
    const [entries, disposals] = await Promise.all([
      this.entryRepository.find({ where: { owner_id: ownerId } }),
      this.disposalRepository.find({ where: { owner_id: ownerId } }),
    ]);
    const totalReceived = roundCurrency(
      entries.reduce((sum, e) => sum + Number(e.amount), 0),
    );
    const totalDisposed = roundCurrency(
      disposals.reduce((sum, d) => sum + Number(d.amount), 0),
    );
    return {
      totalReceived,
      totalDisposed,
      // Received yet to be given away: never negative.
      pendingBalance: roundCurrency(Math.max(0, totalReceived - totalDisposed)),
    };
  }

  async createEntry(
    ownerId: string,
    dto: CreateInterestEntryDto,
  ): Promise<InterestEntryResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    if (!dto.bank_account_id) {
      throw new BadRequestException('Bank account is required.');
    }

    // The referenced account must belong to the caller — never trust an id
    // supplied by the frontend.
    const account = await this.dataSource
      .getRepository(BankAccount)
      .findOne({ where: { id: dto.bank_account_id, owner_id: ownerId } });
    if (!account) {
      throw new NotFoundException('Bank account not found.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    // Duplicate guard: the unique index (owner, occurred_on, bank_account_id,
    // amount) is the database-level backstop.
    const duplicate = await this.entryRepository.findOne({
      where: {
        owner_id: ownerId,
        bank_account_id: dto.bank_account_id,
        occurred_on: occurredOn as unknown as Date,
        amount,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'A matching interest entry already exists for this date, account, and amount.',
      );
    }

    const entry = this.entryRepository.create({
      owner_id: ownerId,
      bank_account_id: dto.bank_account_id,
      occurred_on: occurredOn as unknown as Date,
      amount,
      // Mirrors the column default; set explicitly so the response matches
      // what the Supabase `.select().single()` returned to the client.
      stage: 'received',
      notes,
    });

    try {
      const saved = await this.entryRepository.save(entry);
      return this.toEntryResponse(saved);
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(
          'A matching interest entry already exists for this date, account, and amount.',
        );
      }
      throw error;
    }
  }

  /**
   * Deletes an entry; `interest_disposals.entry_id` is ON DELETE CASCADE, so
   * the linked disposal rows go with it in a single atomic delete.
   */
  async deleteEntry(id: string, ownerId: string): Promise<void> {
    const entry = await this.entryRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!entry) {
      throw new NotFoundException('Interest entry not found.');
    }
    await this.entryRepository.remove(entry);
  }

  async updateEntryStage(
    id: string,
    ownerId: string,
    stage: InterestEntry['stage'],
  ): Promise<InterestEntryResponseDto> {
    const entry = await this.entryRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!entry) {
      throw new NotFoundException('Interest entry not found.');
    }
    entry.stage = stage;
    const saved = await this.entryRepository.save(entry);
    return this.toEntryResponse(saved);
  }

  /**
   * Record a disposal against the overall accumulated interest balance.
   *
   * The amount is split across entries automatically — oldest entries first
   * (FIFO) — until the full amount is covered. Entries whose share is fully
   * covered move to the `disposed` stage. Runs in a single transaction with
   * the owner's entries locked, so two concurrent disposals can never
   * over-dispose the same balance.
   */
  async recordDisposal(
    ownerId: string,
    dto: CreateInterestDisposalDto,
  ): Promise<InterestDisposalResponseDto[]> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    return this.dataSource.transaction(async (manager) => {
      // Serialize disposals per owner: without this, two concurrent requests
      // could each pass the pending-balance check against the same snapshot.
      await manager.query(
        `select pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [`interest:${ownerId}`],
      );

      const entries = await manager.find(InterestEntry, {
        where: { owner_id: ownerId },
        order: { occurred_on: 'ASC', created_at: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const disposals = await manager.find(InterestDisposal, {
        where: { owner_id: ownerId },
      });

      const totalReceived = roundCurrency(
        entries.reduce((sum, e) => sum + Number(e.amount), 0),
      );
      const totalDisposed = roundCurrency(
        disposals.reduce((sum, d) => sum + Number(d.amount), 0),
      );
      const pending = roundCurrency(Math.max(0, totalReceived - totalDisposed));

      if (amount > pending) {
        throw new BadRequestException(
          `Disposal cannot exceed the available balance of ₹${pending.toFixed(2)}.`,
        );
      }

      const disposedByEntry = new Map<string, number>();
      for (const disposal of disposals) {
        disposedByEntry.set(
          disposal.entry_id,
          roundCurrency(
            (disposedByEntry.get(disposal.entry_id) ?? 0) + Number(disposal.amount),
          ),
        );
      }

      const remainingFor = (entry: InterestEntry): number =>
        roundCurrency(
          Math.max(
            0,
            Number(entry.amount) - (disposedByEntry.get(entry.id) ?? 0),
          ),
        );

      // Split `amount` across the entries with balance left, oldest first.
      const allocations: { entryId: string; amount: number }[] = [];
      let left = amount;
      for (const entry of entries) {
        if (left <= 0) break;
        const share = roundCurrency(Math.min(left, remainingFor(entry)));
        if (share <= 0) continue;
        allocations.push({ entryId: entry.id, amount: share });
        left = roundCurrency(left - share);
      }

      const created: InterestDisposalResponseDto[] = [];
      for (const allocation of allocations) {
        const disposal = manager.create(InterestDisposal, {
          owner_id: ownerId,
          entry_id: allocation.entryId,
          occurred_on: occurredOn as unknown as Date,
          amount: allocation.amount,
          notes,
        });
        const saved = await manager.save(disposal);
        created.push(this.toDisposalResponse(saved));
      }

      // Recompute each touched entry's stage from its disposal records:
      // fully covered → disposed, otherwise → received.
      const touchedIds = allocations.map((a) => a.entryId);
      if (touchedIds.length > 0) {
        const touched = entries.filter((e) => touchedIds.includes(e.id));
        for (const entry of touched) {
          const disposed = roundCurrency(
            (disposedByEntry.get(entry.id) ?? 0) +
              allocations
                .filter((a) => a.entryId === entry.id)
                .reduce((sum, a) => sum + a.amount, 0),
          );
          const stage: InterestEntry['stage'] =
            disposed >= Number(entry.amount) - 0.000001 ? 'disposed' : 'received';
          if (stage !== entry.stage) {
            entry.stage = stage;
            await manager.save(entry);
          }
        }
      }

      return created;
    });
  }

  /**
   * Deletes a disposal and re-opens the stage of the entry it covered.
   */
  async deleteDisposal(id: string, ownerId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const disposal = await manager.findOne(InterestDisposal, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!disposal) {
        throw new NotFoundException('Interest disposal not found.');
      }

      await manager.remove(disposal);

      const entry = await manager.findOne(InterestEntry, {
        where: { id: disposal.entry_id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (entry) {
        const remaining = await manager.find(InterestDisposal, {
          where: { entry_id: entry.id },
        });
        const disposed = roundCurrency(
          remaining.reduce((sum, d) => sum + Number(d.amount), 0),
        );
        const stage: InterestEntry['stage'] =
          disposed >= Number(entry.amount) - 0.000001 ? 'disposed' : 'received';
        if (stage !== entry.stage) {
          entry.stage = stage;
          await manager.save(entry);
        }
      }
    });
  }

  /** Entries still holding undisposed balance, oldest first. */
  async openEntries(ownerId: string): Promise<InterestEntry[]> {
    return this.entryRepository.find({
      where: { owner_id: ownerId },
      order: { occurred_on: 'ASC', created_at: 'ASC' },
    });
  }

  async disposalsFor(entryIds: string[]): Promise<InterestDisposal[]> {
    if (entryIds.length === 0) return [];
    return this.disposalRepository.find({ where: { entry_id: In(entryIds) } });
  }

  private toEntryResponse(e: InterestEntry): InterestEntryResponseDto {
    return {
      id: e.id,
      owner_id: e.owner_id,
      bank_account_id: e.bank_account_id,
      occurred_on: e.occurred_on
        ? new Date(e.occurred_on).toISOString().slice(0, 10)
        : '',
      amount: e.amount,
      stage: e.stage,
      notes: e.notes,
      created_at: e.created_at,
      updated_at: e.updated_at,
    };
  }

  private toDisposalResponse(d: InterestDisposal): InterestDisposalResponseDto {
    return {
      id: d.id,
      owner_id: d.owner_id,
      entry_id: d.entry_id,
      occurred_on: d.occurred_on
        ? new Date(d.occurred_on).toISOString().slice(0, 10)
        : '',
      amount: d.amount,
      notes: d.notes,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  }
}
