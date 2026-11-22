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
} from 'typeorm';
import { Debt } from './debts.entity.js';
import { DebtPayment } from './debts.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import {
  CreateDebtDto,
  AddPaymentDto,
  DebtResponseDto,
  DebtPaymentResponseDto,
  DebtTransactionImpact,
} from './dto/debt.dto.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

export type DebtTxDirection = 'in' | 'out' | null;

function debtTxDirection(
  direction: 'i_owe' | 'they_owe',
  impact: DebtTransactionImpact,
): DebtTxDirection {
  if (impact === 'income') return 'in';
  if (impact === 'expense') return 'out';
  if (impact === 'none') return null;
  return direction === 'i_owe' ? 'in' : 'out';
}

@Injectable()
export class DebtsService {
  private readonly logger = new Logger(DebtsService.name);

  constructor(
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly debtPaymentRepository: Repository<DebtPayment>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
    @Inject(TransactionsService)
    private readonly transactionsService: TransactionsService,
  ) {}

  async listDebts(ownerId: string): Promise<DebtResponseDto[]> {
    const debts = await this.debtRepository.find({
      where: { owner_id: ownerId },
      order: { opened_on: 'DESC', created_at: 'DESC' },
    });
    return debts.map((d) => this.toDebtResponse(d));
  }

  async createDebt(
    ownerId: string,
    dto: CreateDebtDto,
  ): Promise<DebtResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const openedOn = dto.opened_on ?? TODAY();
    const impact = dto.impact ?? 'default';
    const txDirection = debtTxDirection(dto.direction, impact);
    const notes = dto.reason ? dto.reason.trim() : null;

    let txId: string | null = null;
    if (txDirection) {
      const tx = await this.transactionsService.create(ownerId, {
        amount,
        direction: txDirection,
        occurred_on: openedOn,
        notes,
        source: 'debt',
        payment_mode: dto.payment_mode ?? 'cash',
        bank_account_id: dto.bank_account_id ?? null,
      });
      txId = tx.id;
    }

    const debt = this.debtRepository.create({
      owner_id: ownerId,
      person_id: dto.person_id,
      direction: dto.direction,
      principal: amount,
      outstanding: amount,
      reason: notes,
      opened_on: openedOn,
    });
    const saved = await this.debtRepository.save(debt);

    if (txId) {
      await this.linkTransactionToDebt(txId, saved.id);
    }

    return this.toDebtResponse(saved);
  }

  async addPayment(
    ownerId: string,
    debtId: string,
    dto: AddPaymentDto,
  ): Promise<void> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Payment must be greater than zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id: debtId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) {
        throw new NotFoundException('Debt not found.');
      }

      if (Number(debt.outstanding) < amount) {
        throw new BadRequestException(
          'Payment is larger than the outstanding amount.',
        );
      }

      const paidOn = dto.paid_on ?? TODAY();
      const txDirection =
        debt.direction === 'i_owe' ? 'out' : 'in';
      const notes = dto.notes ? dto.notes.trim() : null;

      const tx = await this.transactionsService.create(ownerId, {
        amount,
        direction: txDirection,
        occurred_on: paidOn,
        notes,
        source: 'debt',
        source_ref_id: debtId,
        payment_mode: dto.payment_mode ?? 'cash',
        bank_account_id: dto.bank_account_id ?? null,
      });

      const payment = this.debtPaymentRepository.create({
        debt_id: debtId,
        amount,
        paid_on: paidOn,
        transaction_id: tx.id,
        notes,
      });
      await manager.save(payment);

      const newOutstanding = roundCurrency(
        Number(debt.outstanding) - amount,
      );
      debt.outstanding = newOutstanding;
      if (newOutstanding <= 0) {
        debt.closed_on = new Date(paidOn);
      }
      await manager.save(debt);
    });
  }

  async deleteDebt(id: string, ownerId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) {
        throw new NotFoundException('Debt not found.');
      }

      const linked = await manager.find(Transaction, {
        where: { source: 'debt', source_ref_id: id },
      });
      for (const row of linked) {
        await manager.remove(row);
      }

      await manager.remove(debt);
    });
  }

  async linkTransactionToDebt(
    transactionId: string,
    debtId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Transaction,
        { id: transactionId },
        { source_ref_id: debtId },
      );
    });
  }

  private toDebtResponse(d: Debt): DebtResponseDto {
    return {
      id: d.id,
      owner_id: d.owner_id,
      person_id: d.person_id,
      direction: d.direction,
      principal: d.principal,
      outstanding: d.outstanding,
      reason: d.reason,
      opened_on: d.opened_on
        ? new Date(d.opened_on).toISOString().slice(0, 10)
        : '',
      closed_on: d.closed_on
        ? new Date(d.closed_on).toISOString().slice(0, 10)
        : null,
      created_at: d.created_at,
    };
  }
}
