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
import { Transaction } from './transaction.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import {
  CreateTransactionDto,
  TransactionResponseDto,
  OpeningBalanceDto,
} from './dto/transaction.dto.js';
import {
  TxDirection,
  TxSource,
  PaymentMode,
} from './transaction.entity.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
  ) {}

  async list(
    ownerId: string,
    limit = 50,
    cursor?: string,
  ): Promise<TransactionResponseDto[]> {
    const qb = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.owner_id = :ownerId', { ownerId })
      .orderBy('tx.occurred_on', 'DESC')
      .addOrderBy('tx.created_at', 'DESC')
      .take(limit);

    if (cursor) {
      qb.andWhere('(tx.occurred_on, tx.created_at) < (:occurredOn, :createdAt)', {
        occurredOn: cursor,
        createdAt: cursor,
      });
    }

    const rows = await qb.getMany();
    return rows.map((r) => this.toResponse(r));
  }

  async stats(ownerId: string): Promise<{
    income: number;
    expense: number;
    savings: number;
    balance: number;
  }> {
    const result = await this.transactionRepository
      .createQueryBuilder('tx')
      .select(
        `coalesce(sum(case when tx.direction = 'in' then tx.amount else 0 end), 0)`,
        'income',
      )
      .addSelect(
        `coalesce(sum(case when tx.direction = 'out' then tx.amount else 0 end), 0)`,
        'expense',
      )
      .where('tx.owner_id = :ownerId', { ownerId })
      .getRawOne();

    const income = Number(result.income ?? 0);
    const expense = Number(result.expense ?? 0);
    return {
      income,
      expense,
      savings: roundCurrency(income - expense),
      balance: roundCurrency(income - expense),
    };
  }

  async balance(ownerId: string): Promise<OpeningBalanceDto> {
    const result = await this.transactionRepository
      .createQueryBuilder('tx')
      .select(
        `coalesce(sum(case when tx.direction = 'in' then tx.amount else 0 end) - sum(case when tx.direction = 'out' then tx.amount else 0 end), 0)`,
        'balance',
      )
      .where('tx.owner_id = :ownerId', { ownerId })
      .getRawOne();
    return { balance: roundCurrency(Number(result.balance ?? 0)) };
  }

  async openingBalance(ownerId: string): Promise<OpeningBalanceDto> {
    const opening = await this.transactionRepository.findOne({
      where: { owner_id: ownerId, source: 'opening' },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
    return { balance: roundCurrency(opening?.amount ?? 0) };
  }

  async create(
    ownerId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      return this.createTransactionInManager(manager, ownerId, dto);
    });
  }

  async createTransactionInManager(
    manager: EntityManager,
    ownerId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const source = dto.source ?? 'manual';
    const notes = dto.notes ? dto.notes.trim() : null;

    // Resolve bank mode: explicit bank account, else the user's primary account,
    // otherwise fall back to cash (no balance side effect).
    let payment_mode: PaymentMode = 'cash';
    let bank_account_id: string | null = null;

    if (dto.payment_mode === 'bank' && dto.bank_account_id) {
      payment_mode = 'bank';
      bank_account_id = dto.bank_account_id;
    } else if (dto.payment_mode === 'bank' || dto.bank_account_id) {
      const primary = await manager.findOne(BankAccount, {
        where: { owner_id: ownerId, is_primary: true },
      });
      if (primary) {
        payment_mode = 'bank';
        bank_account_id = primary.id;
      } else {
        payment_mode = 'cash';
        bank_account_id = null;
      }
    }

    const tx = manager.create(Transaction, {
      owner_id: ownerId,
      occurred_on: occurredOn,
      amount,
      direction: dto.direction,
      category_id: dto.category_id ?? null,
      notes,
      source,
      source_ref_id: dto.source_ref_id ?? null,
      payment_mode,
      bank_account_id,
      wallet_id: dto.wallet_id ?? null,
    });
    const saved = await manager.save(tx);

    // Atomic bank balance side effect (create_transaction_with_balance_update).
    if (payment_mode === 'bank' && bank_account_id) {
      const account = await manager.findOne(BankAccount, {
        where: { id: bank_account_id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) {
        throw new NotFoundException(
          `Bank account not found: id=${bank_account_id} owner=${ownerId}`,
        );
      }
      const delta = amount;
      if (dto.direction === 'in') {
        account.balance = roundCurrency(account.balance + delta);
      } else {
        account.balance = roundCurrency(account.balance - delta);
      }
      await manager.save(account);
    }

    return this.toResponse(saved);
  }

  async delete(id: string, ownerId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await this.deleteTransactionInManager(manager, id, ownerId);
    });
  }

  /**
   * delete_transaction_with_balance_update, sharing the caller's transaction:
   * locks the row, reverts the previous bank balance effect, then removes it.
   */
  async deleteTransactionInManager(
    manager: EntityManager,
    id: string,
    ownerId: string,
  ): Promise<void> {
    const current = await manager.findOne(Transaction, {
      where: { id, owner_id: ownerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) {
      throw new NotFoundException('Transaction not found.');
    }

    // Linked ledger entries are managed from their dedicated screens.
    if (
      current.source === 'transfer' ||
      current.source === 'wallet_recharge' ||
      current.source === 'wallet_spend'
    ) {
      throw new BadRequestException(
        'This transaction is linked to another record and cannot be deleted here.',
      );
    }

    // Revert the previous bank balance effect before removing the row.
    if (current.payment_mode === 'bank' && current.bank_account_id) {
      const account = await manager.findOne(BankAccount, {
        where: { id: current.bank_account_id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (account) {
        const delta = roundCurrency(current.amount);
        if (current.direction === 'in') {
          account.balance = roundCurrency(account.balance - delta);
        } else {
          account.balance = roundCurrency(account.balance + delta);
        }
        await manager.save(account);
      }
    }

    await manager.remove(current);
  }

  async setOpeningBalance(
    ownerId: string,
    amount: number,
    occurredOn?: string,
  ): Promise<TransactionResponseDto> {
    const value = roundCurrency(amount);
    const date = occurredOn ?? TODAY();
    const existing = await this.transactionRepository.findOne({
      where: { owner_id: ownerId, source: 'opening' },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });

    return this.dataSource.transaction(async (manager) => {
      let tx: Transaction;
      if (existing) {
        existing.amount = value;
        existing.occurred_on = new Date(date);
        tx = await manager.save(existing);
      } else {
        tx = manager.create(Transaction, {
          owner_id: ownerId,
          occurred_on: date,
          amount: value,
          direction: 'in',
          source: 'opening',
          notes: null,
          payment_mode: 'cash',
          bank_account_id: null,
          wallet_id: null,
        });
        tx = await manager.save(tx);
      }
      return this.toResponse(tx);
    });
  }

  async assignToAccount(
    ownerId: string,
    accountId: string,
    transactionIds: string[],
  ): Promise<void> {
    // assign_transactions_to_account: attach unassigned bank transactions to an account.
    await this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(BankAccount, {
        where: { id: accountId, owner_id: ownerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found.');
      }

      await manager.query(
        `update public.transactions
         set bank_account_id = $1, payment_mode = 'bank'
         where id = any($2::uuid[])
           and owner_id = $3
           and payment_mode = 'bank'
           and bank_account_id is null`,
        [accountId, transactionIds, ownerId],
      );
    });
  }

  async categorize(
    id: string,
    ownerId: string,
    categoryId: string | null,
  ): Promise<TransactionResponseDto> {
    const tx = await this.transactionRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found.');
    }
    tx.category_id = categoryId;
    const saved = await this.transactionRepository.save(tx);
    return this.toResponse(saved);
  }

  private toResponse(tx: Transaction): TransactionResponseDto {
    return {
      id: tx.id,
      owner_id: tx.owner_id,
      occurred_on: tx.occurred_on
        ? new Date(tx.occurred_on).toISOString().slice(0, 10)
        : '',
      amount: tx.amount,
      direction: tx.direction,
      category_id: tx.category_id,
      notes: tx.notes,
      source: tx.source,
      source_ref_id: tx.source_ref_id,
      payment_mode: tx.payment_mode,
      bank_account_id: tx.bank_account_id,
      wallet_id: tx.wallet_id,
      created_at: tx.created_at,
    };
  }
}
