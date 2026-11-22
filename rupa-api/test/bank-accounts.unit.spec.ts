import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service.js';
import { CreateBankAccountDto } from '../src/bank-accounts/dto/bank-account.dto.js';
import { UpdateBankAccountDto } from '../src/bank-accounts/dto/bank-account.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BankAccountsService (unit)', () => {
  let service: BankAccountsService;
  let repo: any;
  let dataSource: any;
  let mockManager: any;

  const ownerId = 'owner-2222-2222-2222-222222222222';

  const baseAccount: BankAccount = {
    id: 'ba-1',
    owner_id: ownerId,
    bank_name: 'HDFC Bank',
    account_name: 'Salary Account',
    card_type: 'debit',
    payment_network: 'visa',
    card_number_masked: '4329',
    expiry_date: '12/28',
    cardholder_name: 'PRIMARY HOLDER',
    account_number_masked: null,
    ifsc_code: null,
    balance: 5000,
    credit_limit: null,
    theme: 'blue',
    is_primary: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    repo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    };

    mockManager = {
      count: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      query: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn(async (cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountsService,
        { provide: 'BankAccountRepository', useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(BankAccountsService);
    (service as any).accountRepository = repo;
    (service as any).dataSource = dataSource;
  });

  describe('list', () => {
    it('returns accounts scoped to the owner ordered by created_at desc', async () => {
      repo.find.mockResolvedValue([baseAccount]);

      const result = await service.list(ownerId);

      expect(repo.find).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
        order: { created_at: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ba-1');
    });
  });

  describe('create', () => {
    const dto: CreateBankAccountDto = {
      bank_name: 'ICICI Bank',
      account_name: 'Savings',
      card_type: 'debit',
      payment_network: 'visa',
      card_number_masked: '1234',
      expiry_date: '10/30',
      cardholder_name: 'USER ONE',
      balance: 1000,
    };

    it('creates the first account as primary', async () => {
      mockManager.count.mockResolvedValue(0);
      const created = { ...baseAccount, id: 'ba-2', balance: 1000, is_primary: true };
      mockManager.create.mockReturnValue(created);
      mockManager.save.mockResolvedValue(created);

      const result = await service.create(ownerId, dto);

      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT id FROM bank_accounts WHERE owner_id = $1 AND is_primary = true FOR UPDATE',
        [ownerId],
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        BankAccount,
        expect.objectContaining({ owner_id: ownerId, is_primary: true, balance: 1000 }),
      );
      expect(result.is_primary).toBe(true);
    });

    it('does not make a non-primary account primary when others exist', async () => {
      mockManager.count.mockResolvedValue(1);
      const created = { ...baseAccount, id: 'ba-3', is_primary: false };
      mockManager.create.mockReturnValue(created);
      mockManager.save.mockResolvedValue(created);

      await service.create(ownerId, { ...dto, is_primary: false });

      expect(mockManager.create).toHaveBeenCalledWith(
        BankAccount,
        expect.objectContaining({ is_primary: false }),
      );
    });
  });

  describe('update', () => {
    it('updates an owned account and unsets other primaries', async () => {
      mockManager.findOne.mockResolvedValue({ ...baseAccount, is_primary: false });
      const saved = { ...baseAccount, is_primary: true };
      mockManager.save.mockResolvedValue(saved);

      const result = await service.update('ba-1', ownerId, { is_primary: true });

      expect(mockManager.update).toHaveBeenCalledWith(
        BankAccount,
        { owner_id: ownerId, is_primary: true },
        { is_primary: false },
      );
      expect(result.is_primary).toBe(true);
    });

    it('throws NotFound for another user account', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('ba-1', 'other-owner', { bank_name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes an owned account and promotes the next to primary', async () => {
      const account = { ...baseAccount, is_primary: true };
      repo.findOne.mockResolvedValue(account);
      const replacement = { ...baseAccount, id: 'ba-2', is_primary: false };
      mockManager.findOne.mockResolvedValueOnce(account).mockResolvedValueOnce(replacement);
      mockManager.remove.mockResolvedValue(undefined);
      mockManager.save.mockResolvedValue(replacement);

      await service.remove('ba-1', ownerId);

      expect(mockManager.remove).toHaveBeenCalledWith(account);
      expect(replacement.is_primary).toBe(true);
      expect(mockManager.save).toHaveBeenCalledWith(replacement);
    });

    it('throws NotFound when the account does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('ba-999', ownerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setPrimary', () => {
    it('sets an account as primary', async () => {
      const account = { ...baseAccount, is_primary: false };
      mockManager.findOne.mockResolvedValue(account);
      const updated = { ...account, is_primary: true };
      mockManager.save.mockResolvedValue(updated);

      const result = await service.setPrimary('ba-1', ownerId);

      expect(result.is_primary).toBe(true);
      expect(result.message).toBe('Primary account updated');
    });

    it('throws NotFound for another user account', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.setPrimary('ba-1', 'other-owner')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
