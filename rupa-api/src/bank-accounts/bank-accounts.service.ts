import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BankAccount } from './bank-account.entity.js';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  BankAccountResponseDto,
  SetPrimaryResponseDto,
} from './dto/bank-account.dto.js';
import { roundCurrency } from '../common/money-transformer.js';

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    @InjectRepository(BankAccount)
    private readonly accountRepository: Repository<BankAccount>,
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  async list(ownerId: string): Promise<BankAccountResponseDto[]> {
    const accounts = await this.accountRepository.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
    });
    return accounts.map((a) => this.toResponse(a));
  }

  async create(
    ownerId: string,
    dto: CreateBankAccountDto,
  ): Promise<BankAccountResponseDto> {
    const validated = await this.validateDto(dto, CreateBankAccountDto);
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Serialize primary-account changes so two concurrent creates cannot both
      // end up marked primary.
      await manager.query(
        'SELECT id FROM bank_accounts WHERE owner_id = $1 AND is_primary = true FOR UPDATE',
        [ownerId],
      );

      const existingCount = await manager.count(BankAccount, {
        where: { owner_id: ownerId },
      });
      const isPrimary = validated.is_primary === true || existingCount === 0;

      if (isPrimary) {
        await manager.update(
          BankAccount,
          { owner_id: ownerId, is_primary: true },
          { is_primary: false },
        );
      }

      const account = manager.create(BankAccount, {
        owner_id: ownerId,
        bank_name: validated.bank_name,
        account_name: validated.account_name,
        card_type: validated.card_type,
        payment_network: validated.payment_network,
        card_number_masked: validated.card_number_masked,
        expiry_date: validated.expiry_date,
        cardholder_name: validated.cardholder_name,
        account_number_masked: validated.account_number_masked ?? null,
        ifsc_code: validated.ifsc_code ?? null,
        balance: roundCurrency(validated.balance ?? 0),
        credit_limit:
          validated.credit_limit == null ? null : roundCurrency(validated.credit_limit),
        theme: validated.theme ?? 'blue',
        is_primary: isPrimary,
      });
      const saved = await manager.save(account);
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccountResponseDto> {
    const validated = await this.validateDto(dto, UpdateBankAccountDto);
    return this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(
        'SELECT id FROM bank_accounts WHERE owner_id = $1 AND is_primary = true FOR UPDATE',
        [ownerId],
      );

      const account = await manager.findOne(BankAccount, {
        where: { id, owner_id: ownerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found');
      }

      if (validated.is_primary === true && !account.is_primary) {
        await manager.update(
          BankAccount,
          { owner_id: ownerId, is_primary: true },
          { is_primary: false },
        );
      }

      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(validated)) {
        if (value !== undefined) {
          changes[key] = value;
        }
      }
      if (changes.balance !== undefined) {
        changes.balance = roundCurrency(changes.balance as number);
      }
      if (changes.credit_limit !== undefined) {
        changes.credit_limit =
          changes.credit_limit == null ? null : roundCurrency(changes.credit_limit as number);
      }
      Object.assign(account, changes as Partial<BankAccount>);
      const saved = await manager.save(account);
      return this.toResponse(saved);
    });
  }

  async remove(id: string, ownerId: string): Promise<void> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const account = await manager.findOne(BankAccount, {
        where: { id, owner_id: ownerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found');
      }

      const wasPrimary = account.is_primary;
      await manager.remove(account);

      if (wasPrimary) {
        const replacement = await manager.findOne(BankAccount, {
          where: { owner_id: ownerId },
          order: { created_at: 'DESC' },
        });
        if (replacement) {
          replacement.is_primary = true;
          await manager.save(replacement);
        }
      }
    });
  }

  async setPrimary(
    id: string,
    ownerId: string,
  ): Promise<SetPrimaryResponseDto> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(
        'SELECT id FROM bank_accounts WHERE owner_id = $1 AND is_primary = true FOR UPDATE',
        [ownerId],
      );

      const account = await manager.findOne(BankAccount, {
        where: { id, owner_id: ownerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found');
      }

      if (!account.is_primary) {
        await manager.update(
          BankAccount,
          { owner_id: ownerId, is_primary: true },
          { is_primary: false },
        );
        account.is_primary = true;
        await manager.save(account);
      }

      return { id: account.id, is_primary: true, message: 'Primary account updated' };
    });
  }

  private async validateDto<T extends object>(
    dto: unknown,
    dtoClass: new (...args: any[]) => T,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, dto);
    const errors = await validate(instance);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages.join(', '));
    }
    return instance;
  }

  private toResponse(account: BankAccount): BankAccountResponseDto {
    return {
      id: account.id,
      owner_id: account.owner_id,
      bank_name: account.bank_name,
      account_name: account.account_name,
      card_type: account.card_type,
      payment_network: account.payment_network,
      card_number_masked: account.card_number_masked,
      expiry_date: account.expiry_date,
      cardholder_name: account.cardholder_name,
      account_number_masked: account.account_number_masked,
      ifsc_code: account.ifsc_code,
      balance: account.balance,
      credit_limit: account.credit_limit,
      theme: account.theme,
      is_primary: account.is_primary,
      created_at: account.created_at,
    };
  }
}
