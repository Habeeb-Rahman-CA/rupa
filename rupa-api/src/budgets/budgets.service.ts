import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './budget.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import {
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetResponseDto,
  BudgetStatus,
} from './dto/budget.dto.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async listBudgets(ownerId: string): Promise<BudgetResponseDto[]> {
    const budgets = await this.budgetRepository.find({
      where: { owner_id: ownerId },
      order: { start_date: 'DESC', created_at: 'DESC' },
    });
    return Promise.all(budgets.map((b) => this.toResponse(b, ownerId)));
  }

  async getBudget(
    id: string,
    ownerId: string,
  ): Promise<BudgetResponseDto> {
    const budget = await this.budgetRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found.');
    }
    return this.toResponse(budget, ownerId);
  }

  async createBudget(
    ownerId: string,
    dto: CreateBudgetDto,
  ): Promise<BudgetResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Budget amount must be greater than zero.');
    }

    const startDate = dto.start_date ?? TODAY();
    const endDate = dto.end_date ?? TODAY();
    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('End date must not precede start date.');
    }

    const budget = this.budgetRepository.create({
      owner_id: ownerId,
      name: dto.name.trim(),
      category_id: dto.category_id ?? null,
      amount,
      period: dto.period ?? 'monthly',
      start_date: new Date(startDate),
      end_date: new Date(endDate),
      recurring: dto.recurring ?? false,
      thresholds: dto.thresholds ?? [50, 75, 90, 100],
    });
    const saved = await this.budgetRepository.save(budget);
    return this.toResponse(saved, ownerId);
  }

  async updateBudget(
    id: string,
    ownerId: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    const budget = await this.budgetRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found.');
    }

    if (dto.name !== undefined) {
      budget.name = dto.name.trim();
    }
    if (dto.category_id !== undefined) {
      budget.category_id = dto.category_id;
    }
    if (dto.amount !== undefined) {
      budget.amount = roundCurrency(dto.amount);
    }
    if (dto.period !== undefined) {
      budget.period = dto.period;
    }
    if (dto.start_date !== undefined) {
      budget.start_date = new Date(dto.start_date);
    }
    if (dto.end_date !== undefined) {
      budget.end_date = new Date(dto.end_date);
    }
    if (dto.recurring !== undefined) {
      budget.recurring = dto.recurring;
    }
    if (dto.thresholds !== undefined) {
      budget.thresholds = dto.thresholds;
    }

    if (new Date(budget.end_date) < new Date(budget.start_date)) {
      throw new BadRequestException('End date must not precede start date.');
    }

    const saved = await this.budgetRepository.save(budget);
    return this.toResponse(saved, ownerId);
  }

  async deleteBudget(id: string, ownerId: string): Promise<void> {
    const budget = await this.budgetRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found.');
    }
    await this.budgetRepository.remove(budget);
  }

  private async computeSpent(
    ownerId: string,
    budget: Budget,
  ): Promise<number> {
    const qb = this.transactionRepository
      .createQueryBuilder('tx')
      .select('coalesce(sum(tx.amount), 0)', 'spent')
      .where('tx.owner_id = :ownerId', { ownerId })
      .andWhere('tx.direction = :direction', { direction: 'out' })
      .andWhere('tx.occurred_on >= :start', {
        start: budget.start_date,
      })
      .andWhere('tx.occurred_on <= :end', { end: budget.end_date });

    if (budget.category_id) {
      qb.andWhere('tx.category_id = :categoryId', {
        categoryId: budget.category_id,
      });
    }

    const raw = await qb.getRawOne();
    return roundCurrency(Number(raw.spent ?? 0));
  }

  private statusFor(percentage: number, thresholds: number[]): BudgetStatus {
    if (percentage >= 100) {
      return 'exceeded';
    }
    const nearLimit =
      thresholds.length > 0 ? Math.max(...thresholds.filter((t) => t < 100)) : 90;
    if (percentage >= nearLimit) {
      return 'near_limit';
    }
    return 'on_track';
  }

  private async toResponse(
    budget: Budget,
    ownerId: string,
  ): Promise<BudgetResponseDto> {
    const spent = await this.computeSpent(ownerId, budget);
    const amount = budget.amount;
    const remaining = roundCurrency(amount - spent);
    const percentage = amount > 0 ? roundCurrency((spent / amount) * 100) : 0;
    const status = this.statusFor(percentage, budget.thresholds ?? []);
    return {
      id: budget.id,
      owner_id: budget.owner_id,
      name: budget.name,
      category_id: budget.category_id,
      amount,
      period: budget.period,
      start_date: budget.start_date
        ? new Date(budget.start_date).toISOString().slice(0, 10)
        : '',
      end_date: budget.end_date
        ? new Date(budget.end_date).toISOString().slice(0, 10)
        : '',
      recurring: budget.recurring,
      thresholds: budget.thresholds,
      spent,
      remaining,
      percentage,
      status,
      created_at: budget.created_at,
      updated_at: budget.updated_at,
    };
  }
}
