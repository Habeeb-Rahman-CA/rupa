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
import { Wallet } from './wallets.entity.js';
import { WalletTransaction } from './wallets.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import {
  CreateWalletDto,
  UpdateWalletDto,
  WalletResponseDto,
  CreateWalletTransactionDto,
  WalletTransactionResponseDto,
} from './dto/wallet.dto.js';
import { roundCurrency } from '../common/money-transformer.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @Inject(TypeOrmDataSource)
    private readonly dataSource: TypeOrmDataSource,
  ) {}

  async listWallets(ownerId: string): Promise<WalletResponseDto[]> {
    const wallets = await this.walletRepository.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
    });
    return wallets.map((w) => this.toWalletResponse(w));
  }

  async createWallet(
    ownerId: string,
    dto: CreateWalletDto,
  ): Promise<WalletResponseDto> {
    const initial = roundCurrency(dto.initial_balance ?? 0);
    const wallet = this.walletRepository.create({
      owner_id: ownerId,
      name: dto.name.trim(),
      initial_balance: initial,
      balance: initial,
      minimum_balance: roundCurrency(dto.minimum_balance ?? 0),
      kind: dto.kind ?? 'cash',
    });
    const saved = await this.walletRepository.save(wallet);
    return this.toWalletResponse(saved);
  }

  async updateWallet(
    id: string,
    ownerId: string,
    dto: UpdateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }
    if (dto.name !== undefined) {
      wallet.name = dto.name.trim();
    }
    if (dto.minimum_balance !== undefined) {
      wallet.minimum_balance = roundCurrency(dto.minimum_balance);
    }
    const saved = await this.walletRepository.save(wallet);
    return this.toWalletResponse(saved);
  }

  async deleteWallet(id: string, ownerId: string): Promise<void> {
    const wallet = await this.walletRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }
    await this.walletRepository.remove(wallet);
  }

  async listWalletTransactions(
    ownerId: string,
    walletId: string,
  ): Promise<WalletTransactionResponseDto[]> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, owner_id: ownerId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }
    const rows = await this.walletTransactionRepository.find({
      where: { wallet_id: walletId, owner_id: ownerId },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toWalletTransactionResponse(r));
  }

  async createWalletTransaction(
    ownerId: string,
    walletId: string,
    dto: CreateWalletTransactionDto,
  ): Promise<WalletTransactionResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    return this.dataSource.transaction(async (manager) => {
      // Idempotency: a retried request returns the already-committed row.
      if (dto.request_id) {
        const existing = await manager.findOne(WalletTransaction, {
          where: { id: dto.request_id },
        });
        if (existing) {
          return this.toWalletTransactionResponse(existing);
        }
      }

      const wallet = await manager.findOne(Wallet, {
        where: { id: walletId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      if (dto.kind !== 'recharge' && dto.kind !== 'spend') {
        throw new BadRequestException('Wallet transaction type is invalid.');
      }

      const debitTransactionId = dto.request_id ?? this.newId();
      const creditTransactionId = this.newId();

      if (dto.kind === 'spend') {
        if (dto.funding_mode != null || dto.bank_account_id != null) {
          throw new BadRequestException(
            'Wallet spending cannot include a recharge source.',
          );
        }
        if (wallet.balance < amount) {
          throw new BadRequestException('Insufficient balance in the wallet.');
        }
      } else {
        // recharge
        if (dto.funding_mode !== 'cash' && dto.funding_mode !== 'bank') {
          throw new BadRequestException(
            'Choose cash or a bank account for the recharge.',
          );
        }
        if (dto.funding_mode === 'cash' && dto.bank_account_id != null) {
          throw new BadRequestException(
            'Cash recharges cannot include a bank account.',
          );
        }
        if (dto.funding_mode === 'bank' && !dto.bank_account_id) {
          throw new BadRequestException(
            'A bank account is required for this recharge.',
          );
        }
        if (dto.funding_mode === 'bank') {
          if (!dto.bank_account_id) {
            throw new NotFoundException('Bank account not found.');
          }
          const account = await manager.findOne(BankAccount, {
            where: { id: dto.bank_account_id, owner_id: ownerId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!account) {
            throw new NotFoundException('Bank account not found.');
          }
          if (!account) {
            throw new NotFoundException('Bank account not found.');
          }
          if (account.balance < amount) {
            throw new BadRequestException(
              'Insufficient balance in the selected bank account.',
            );
          }
        }
      }

      const debitSource =
        dto.kind === 'spend' ? 'wallet_spend' : 'wallet_recharge';
      const debitPaymentMode =
        dto.kind === 'recharge' ? (dto.funding_mode ?? 'cash') : 'cash';
      const debitBankAccountId =
        dto.kind === 'recharge' && dto.funding_mode === 'bank'
          ? dto.bank_account_id
          : null;

      await manager.query(
        `insert into public.transactions (
          id, owner_id, occurred_on, amount, direction, category_id, notes,
          source, source_ref_id, payment_mode, bank_account_id, wallet_id
        ) values ($1,$2,$3,$4,'out',null,$5,$6,$7,$8,$9,$10)`,
        [
          debitTransactionId,
          ownerId,
          occurredOn,
          amount,
          notes,
          debitSource,
          debitTransactionId,
          debitPaymentMode,
          debitBankAccountId,
          walletId,
        ],
      );

      if (dto.kind === 'recharge') {
        const creditSql = `insert into public.transactions (
          id, owner_id, occurred_on, amount, direction, category_id, notes,
          source, source_ref_id, payment_mode, bank_account_id, wallet_id
        ) values ($1,$2,$3,$4,'in',null,$5,'wallet_recharge',$6,'cash',null,$7)`;
        await manager.query(creditSql, [
          creditTransactionId,
          ownerId,
          occurredOn,
          amount,
          notes,
          debitTransactionId,
          walletId,
        ]);
      }

      await manager.query(
        `insert into public.wallet_transactions (
          id, owner_id, wallet_id, kind, amount, occurred_on, category_id,
          funding_mode, bank_account_id, notes, debit_transaction_id, credit_transaction_id
        ) values ($1,$2,$3,$4,$5,$6,null,$7,$8,$9,$10,$11)`,
        [
          debitTransactionId,
          ownerId,
          walletId,
          dto.kind,
          amount,
          occurredOn,
          dto.kind === 'recharge' ? (dto.funding_mode ?? 'cash') : null,
          debitBankAccountId,
          notes,
          debitTransactionId,
          dto.kind === 'recharge' ? creditTransactionId : null,
        ],
      );

      if (dto.kind === 'recharge') {
        if (dto.funding_mode === 'bank') {
          await manager.query(
            `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
            [amount, dto.bank_account_id, ownerId],
          );
        }
        wallet.balance = roundCurrency(wallet.balance + amount);
      } else {
        wallet.balance = roundCurrency(wallet.balance - amount);
      }
      await manager.save(wallet);

      const savedTx = await manager.findOne(WalletTransaction, {
        where: { id: debitTransactionId },
      });
      if (!savedTx) {
        throw new NotFoundException('Wallet transaction not found.');
      }
      return this.toWalletTransactionResponse(savedTx);
    });
  }

  async updateWalletTransaction(
    ownerId: string,
    walletTransactionId: string,
    dto: CreateWalletTransactionDto,
  ): Promise<WalletTransactionResponseDto> {
    const amount = roundCurrency(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const occurredOn = dto.occurred_on ?? TODAY();
    const notes = dto.notes ? dto.notes.trim() : null;

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(WalletTransaction, {
        where: { id: walletTransactionId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('Wallet transaction not found.');
      }

      if (dto.kind !== current.kind) {
        throw new BadRequestException(
          'Wallet transaction type cannot be changed after saving.',
        );
      }

      const wallet = await manager.findOne(Wallet, {
        where: { id: current.wallet_id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      // Revert the previous effect.
      let calculatedBalance = wallet.balance;
      if (current.kind === 'recharge') {
        calculatedBalance = roundCurrency(calculatedBalance - current.amount);
        if (current.bank_account_id) {
          await manager.query(
            `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
            [current.amount, current.bank_account_id, ownerId],
          );
        }
      } else {
        calculatedBalance = roundCurrency(calculatedBalance + current.amount);
      }

      // Apply the new effect.
      if (dto.kind === 'spend') {
        if (dto.funding_mode != null || dto.bank_account_id != null) {
          throw new BadRequestException(
            'Wallet spending cannot include a recharge source.',
          );
        }
        calculatedBalance = roundCurrency(calculatedBalance - amount);
      } else {
        if (dto.funding_mode !== 'cash' && dto.funding_mode !== 'bank') {
          throw new BadRequestException(
            'Choose cash or a bank account for the recharge.',
          );
        }
        if (dto.funding_mode === 'bank' && !dto.bank_account_id) {
          throw new BadRequestException(
            'A bank account is required for this recharge.',
          );
        }
        if (dto.funding_mode === 'bank') {
          if (!dto.bank_account_id) {
            throw new NotFoundException('Bank account not found.');
          }
          const account = await manager.findOne(BankAccount, {
            where: { id: dto.bank_account_id, owner_id: ownerId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!account) {
            throw new NotFoundException('Bank account not found.');
          }
          if (!account) {
            throw new NotFoundException('Bank account not found.');
          }
          if (account.balance < amount) {
            throw new BadRequestException(
              'Insufficient balance in the selected bank account.',
            );
          }
          await manager.query(
            `update public.bank_accounts set balance = balance - $1 where id = $2 and owner_id = $3`,
            [amount, dto.bank_account_id, ownerId],
          );
        }
        calculatedBalance = roundCurrency(calculatedBalance + amount);
      }

      if (calculatedBalance < 0) {
        throw new BadRequestException(
          'This change would make the wallet balance negative.',
        );
      }

      await manager.query(
        `update public.transactions
         set occurred_on = $1, amount = $2, direction = 'out', category_id = null, notes = $3,
             source = $4, source_ref_id = $5, payment_mode = $6,
             bank_account_id = $7, wallet_id = $8
         where id = $9 and owner_id = $10`,
        [
          occurredOn,
          amount,
          notes,
          dto.kind === 'spend' ? 'wallet_spend' : 'wallet_recharge',
          walletTransactionId,
          dto.kind === 'recharge' ? (dto.funding_mode ?? 'cash') : 'cash',
          dto.kind === 'recharge' && dto.funding_mode === 'bank'
            ? dto.bank_account_id
            : null,
          current.wallet_id,
          current.debit_transaction_id,
          ownerId,
        ],
      );

      if (dto.kind === 'recharge') {
        const creditSql = `update public.transactions
           set occurred_on = $1, amount = $2, direction = 'in', category_id = null, notes = $3,
               source = 'wallet_recharge', source_ref_id = $4, payment_mode = 'cash',
               bank_account_id = null, wallet_id = $5
           where id = $6 and owner_id = $7`;
        await manager.query(creditSql, [
          occurredOn,
          amount,
          notes,
          walletTransactionId,
          current.wallet_id,
          current.credit_transaction_id,
          ownerId,
        ]);
      }

      await manager.query(
        `update public.wallet_transactions
         set kind = $1, amount = $2, occurred_on = $3, category_id = null,
             funding_mode = $4, bank_account_id = $5, notes = $6
         where id = $7 and owner_id = $8`,
        [
          dto.kind,
          amount,
          occurredOn,
          dto.kind === 'recharge' ? (dto.funding_mode ?? 'cash') : null,
          dto.kind === 'recharge' && dto.funding_mode === 'bank'
            ? dto.bank_account_id
            : null,
          notes,
          walletTransactionId,
          ownerId,
        ],
      );

      wallet.balance = calculatedBalance;
      await manager.save(wallet);

      const updatedTx = await manager.findOne(WalletTransaction, {
        where: { id: walletTransactionId },
      });
      if (!updatedTx) {
        throw new NotFoundException('Wallet transaction not found.');
      }
      return this.toWalletTransactionResponse(updatedTx);
    });
  }

  async deleteWalletTransaction(
    ownerId: string,
    walletTransactionId: string,
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(WalletTransaction, {
        where: { id: walletTransactionId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new NotFoundException('Wallet transaction not found.');
      }

      const wallet = await manager.findOne(Wallet, {
        where: { id: current.wallet_id, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      if (current.bank_account_id) {
        await manager.query(
          `select id from public.bank_accounts where id = $1 and owner_id = $2 for update`,
          [current.bank_account_id, ownerId],
        );
      }

      let calculatedBalance = wallet.balance;
      if (current.kind === 'recharge') {
        calculatedBalance = roundCurrency(calculatedBalance - current.amount);
        if (current.bank_account_id) {
          await manager.query(
            `update public.bank_accounts set balance = balance + $1 where id = $2 and owner_id = $3`,
            [current.amount, current.bank_account_id, ownerId],
          );
        }
      } else {
        calculatedBalance = roundCurrency(calculatedBalance + current.amount);
      }

      if (calculatedBalance < 0) {
        throw new BadRequestException(
          'This recharge cannot be deleted because later spending uses it.',
        );
      }

      await manager.query(
        `delete from public.wallet_transactions where id = $1 and owner_id = $2`,
        [walletTransactionId, ownerId],
      );

      const toDelete = [current.debit_transaction_id];
      if (current.credit_transaction_id) {
        toDelete.push(current.credit_transaction_id);
      }
      await manager.query(
        `delete from public.transactions where id = any($1::uuid[]) and owner_id = $2`,
        [toDelete, ownerId],
      );

      wallet.balance = calculatedBalance;
      await manager.save(wallet);
    });
  }

  private newId(): string {
    return crypto.randomUUID();
  }

  private toWalletResponse(w: Wallet): WalletResponseDto {
    return {
      id: w.id,
      owner_id: w.owner_id,
      name: w.name,
      initial_balance: w.initial_balance,
      balance: w.balance,
      minimum_balance: w.minimum_balance,
      kind: w.kind,
      created_at: w.created_at,
    };
  }

  private toWalletTransactionResponse(
    wt: WalletTransaction,
  ): WalletTransactionResponseDto {
    return {
      id: wt.id,
      owner_id: wt.owner_id,
      wallet_id: wt.wallet_id,
      kind: wt.kind,
      amount: wt.amount,
      occurred_on: wt.occurred_on
        ? new Date(wt.occurred_on).toISOString().slice(0, 10)
        : '',
      category_id: wt.category_id,
      funding_mode: wt.funding_mode,
      bank_account_id: wt.bank_account_id,
      notes: wt.notes,
      debit_transaction_id: wt.debit_transaction_id,
      credit_transaction_id: wt.credit_transaction_id,
      created_at: wt.created_at,
    };
  }
}
