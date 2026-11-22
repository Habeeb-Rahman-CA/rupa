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
import { AccountTransfer } from './account-transfer.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import {
  CreateAccountTransferDto,
  UpdateAccountTransferDto,
  AccountTransferResponseDto,
} from './dto/transfer.dto.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectRepository(AccountTransfer)
    private readonly transferRepository: Repository<AccountTransfer>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
  ) {}

  async listTransfers(ownerId: string): Promise<AccountTransferResponseDto[]> {
    const transfers = await this.transferRepository.find({
      where: { owner_id: ownerId },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
    return transfers.map((t) => this.toResponse(t));
  }

  async createTransfer(
    ownerId: string,
    dto: CreateAccountTransferDto,
  ): Promise<AccountTransferResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Transfer amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    if (dto.source_account_id === dto.destination_account_id) {
      throw new BadRequestException(
        'Source and destination accounts must be different.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const lockSql = `select id from public.bank_accounts
        where owner_id = $1 and id in ($2, $3)
        order by id for update`;
      await manager.query(lockSql, [
        ownerId,
        dto.source_account_id,
        dto.destination_account_id,
      ]);

      const found = await manager.query(
        `select count(*) from public.bank_accounts
         where owner_id = $1 and id in ($2, $3)`,
        [ownerId, dto.source_account_id, dto.destination_account_id],
      );
      if (Number(found[0].count) !== 2) {
        throw new BadRequestException(
          'Both accounts must belong to the signed-in user.',
        );
      }

      const source = await manager.findOne(BankAccount, {
        where: { id: dto.source_account_id, owner_id: ownerId },
      });
      if (!source || Number(source.balance) < amount) {
        throw new BadRequestException(
          'Insufficient balance in the source account.',
        );
      }

      const transferId = crypto.randomUUID();
      const debitId = crypto.randomUUID();
      const creditId = crypto.randomUUID();

      const insertTransferSql = `insert into public.transfers (
        id, owner_id, source_account_id, destination_account_id, amount,
        occurred_on, notes
      ) values ($1,$2,$3,$4,$5,$6,$7)`;
      await manager.query(insertTransferSql, [
        transferId,
        ownerId,
        dto.source_account_id,
        dto.destination_account_id,
        amount,
        occurredOn,
        notes,
      ]);

      const insertDebitSql = `insert into public.transactions (
        id, owner_id, occurred_on, amount, direction, category_id, notes,
        source, source_ref_id, payment_mode, bank_account_id, wallet_id
      ) values ($1,$2,$3,$4,'out',null,$5,'transfer',$6,'bank',$7,null)`;
      await manager.query(insertDebitSql, [
        debitId,
        ownerId,
        occurredOn,
        amount,
        notes,
        transferId,
        dto.source_account_id,
      ]);

      const insertCreditSql = `insert into public.transactions (
        id, owner_id, occurred_on, amount, direction, category_id, notes,
        source, source_ref_id, payment_mode, bank_account_id, wallet_id
      ) values ($1,$2,$3,$4,'in',null,$5,'transfer',$6,'bank',$7,null)`;
      await manager.query(insertCreditSql, [
        creditId,
        ownerId,
        occurredOn,
        amount,
        notes,
        transferId,
        dto.destination_account_id,
      ]);

      await manager.query(
        `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
        [amount, dto.source_account_id, ownerId],
      );
      await manager.query(
        `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
        [amount, dto.destination_account_id, ownerId],
      );

      await manager.query(
        `update public.transfers
         set debit_transaction_id = $1, credit_transaction_id = $2
         where id = $3 and owner_id = $4`,
        [debitId, creditId, transferId, ownerId],
      );

      const savedTransfer = await manager.findOne(AccountTransfer, {
        where: { id: transferId },
      });
      if (!savedTransfer) {
        throw new NotFoundException('Transfer not found.');
      }
      return this.toResponse(savedTransfer);
    });
  }

  async updateTransfer(
    id: string,
    ownerId: string,
    dto: UpdateAccountTransferDto,
  ): Promise<AccountTransferResponseDto> {
    const amount = dto.amount != null ? roundCurrency(dto.amount) : null;
    if (amount != null && !(amount > 0)) {
      throw new BadRequestException('Transfer amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(AccountTransfer, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('Transfer not found.');
      }

      if (current.debit_transaction_id == null || current.credit_transaction_id == null) {
        throw new BadRequestException('Transfer ledger records are incomplete.');
      }

      const newSource = dto.source_account_id ?? current.source_account_id;
      const newDestination =
        dto.destination_account_id ?? current.destination_account_id;
      const newAmount = amount ?? current.amount;

      if (newSource === newDestination) {
        throw new BadRequestException(
          'Source and destination accounts must be different.',
        );
      }

      const allAccounts = [
        current.source_account_id,
        current.destination_account_id,
        newSource,
        newDestination,
      ];
      const uniqueIds = [...new Set(allAccounts)];

      const lockSql = `select id from public.bank_accounts
        where owner_id = $1 and id = any($2::uuid[])
        order by id for update`;
      await manager.query(lockSql, [ownerId, uniqueIds]);

      const found = await manager.query(
        `select count(distinct id) from public.bank_accounts
         where owner_id = $1 and id = any($2::uuid[])`,
        [ownerId, uniqueIds],
      );
      if (Number(found[0].count) !== uniqueIds.length) {
        throw new BadRequestException(
          'All transfer accounts must belong to the signed-in user.',
        );
      }

      await manager.query(
        `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
        [current.amount, current.source_account_id, ownerId],
      );
      await manager.query(
        `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
        [current.amount, current.destination_account_id, ownerId],
      );

      const source = await manager.findOne(BankAccount, {
        where: { id: newSource, owner_id: ownerId },
      });
      if (!source || Number(source.balance) < newAmount) {
        throw new BadRequestException(
          'Insufficient balance in the source account.',
        );
      }

      await manager.query(
        `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
        [newAmount, newSource, ownerId],
      );
      await manager.query(
        `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
        [newAmount, newDestination, ownerId],
      );

      const updateDebitSql = `update public.transactions
        set occurred_on = $1, amount = $2, direction = 'out', category_id = null,
            notes = $3, source = 'transfer', source_ref_id = $4,
            payment_mode = 'bank', bank_account_id = $5, wallet_id = null
        where id = $6 and owner_id = $7`;
      await manager.query(updateDebitSql, [
        occurredOn,
        newAmount,
        notes,
        id,
        newSource,
        current.debit_transaction_id,
        ownerId,
      ]);

      const updateCreditSql = `update public.transactions
        set occurred_on = $1, amount = $2, direction = 'in', category_id = null,
            notes = $3, source = 'transfer', source_ref_id = $4,
            payment_mode = 'bank', bank_account_id = $5, wallet_id = null
        where id = $6 and owner_id = $7`;
      await manager.query(updateCreditSql, [
        occurredOn,
        newAmount,
        notes,
        id,
        newDestination,
        current.credit_transaction_id,
        ownerId,
      ]);

      await manager.query(
        `update public.transfers
         set source_account_id = $1, destination_account_id = $2, amount = $3,
             occurred_on = $4, notes = $5
         where id = $6 and owner_id = $7`,
        [
          newSource,
          newDestination,
          newAmount,
          occurredOn,
          notes,
          id,
          ownerId,
        ],
      );

      const updatedTransfer = await manager.findOne(AccountTransfer, {
        where: { id },
      });
      if (!updatedTransfer) {
        throw new NotFoundException('Transfer not found.');
      }
      return this.toResponse(updatedTransfer);
    });
  }

  async deleteTransfer(
    id: string,
    ownerId: string,
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(AccountTransfer, {
        where: { id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('Transfer not found.');
      }

      const lockSql = `select id from public.bank_accounts
        where owner_id = $1 and id in ($2, $3)
        order by id for update`;
      await manager.query(lockSql, [
        ownerId,
        current.source_account_id,
        current.destination_account_id,
      ]);

      await manager.query(
        `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
        [current.amount, current.source_account_id, ownerId],
      );
      await manager.query(
        `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
        [current.amount, current.destination_account_id, ownerId],
      );

      const toDelete = [
        current.debit_transaction_id,
        current.credit_transaction_id,
      ].filter((x) => x != null);
      await manager.query(
        `delete from public.transactions where id = any($1::uuid[]) and owner_id = $2`,
        [toDelete, ownerId],
      );

      await manager.query(
        `delete from public.transfers where id = $1 and owner_id = $2`,
        [id, ownerId],
      );
    });
  }

  private toResponse(t: AccountTransfer): AccountTransferResponseDto {
    return {
      id: t.id,
      owner_id: t.owner_id,
      source_account_id: t.source_account_id,
      destination_account_id: t.destination_account_id,
      amount: t.amount,
      occurred_on: t.occurred_on
        ? new Date(t.occurred_on).toISOString().slice(0, 10)
        : '',
      notes: t.notes,
      debit_transaction_id: t.debit_transaction_id,
      credit_transaction_id: t.credit_transaction_id,
      created_at: t.created_at,
    };
  }
}
