import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Wallet } from '../src/wallets/wallets.entity.js';
import { WalletTransaction } from '../src/wallets/wallets.entity.js';
import { WalletsService } from '../src/wallets/wallets.service.js';
import { BankAccount } from '../src/bank-accounts/bank-account.entity.js';
import { CreateWalletDto } from '../src/wallets/dto/wallet.dto.js';
import { UpdateWalletDto } from '../src/wallets/dto/wallet.dto.js';
import { CreateWalletTransactionDto } from '../src/wallets/dto/wallet.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('WalletsService (unit)', () => {
  let service: WalletsService;
  let walletRepo: any;
  let wtRepo: any;
  let baRepo: any;
  let dataSource: any;
  let manager: any;

  const ownerId = 'owner-4444-4444-4444-444444444444';

  beforeEach(async () => {
    vi.clearAllMocks();

    manager = {
      create: vi.fn(),
      save: vi.fn(),
      findOne: vi.fn(),
      remove: vi.fn(),
      query: vi.fn(),
    };

    dataSource = { transaction: vi.fn(async (cb: any) => cb(manager)) };

    walletRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn(), remove: vi.fn() };
    wtRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    baRepo = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: 'WalletRepository', useValue: walletRepo },
        { provide: 'WalletTransactionRepository', useValue: wtRepo },
        { provide: 'BankAccountRepository', useValue: baRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(WalletsService);
    (service as any).walletRepository = walletRepo;
    (service as any).walletTransactionRepository = wtRepo;
    (service as any).bankAccountRepository = baRepo;
    (service as any).dataSource = dataSource;
  });

  const baseWallet: Wallet = {
    id: 'w-1',
    owner_id: ownerId,
    name: 'Cash',
    initial_balance: 1000,
    balance: 1000,
    minimum_balance: 0,
    kind: 'cash',
    created_at: new Date(),
  };

  describe('listWallets', () => {
    it('returns owner wallets ordered by created_at desc', async () => {
      walletRepo.find.mockResolvedValue([baseWallet]);
      const result = await service.listWallets(ownerId);
      expect(walletRepo.find).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
        order: { created_at: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('w-1');
    });
  });

  describe('createWallet', () => {
    it('creates a wallet with balance = initial_balance', async () => {
      const created = { ...baseWallet, id: 'w-2', balance: 750, initial_balance: 750 };
      walletRepo.create.mockReturnValue(created);
      walletRepo.save.mockResolvedValue(created);

      const result = await service.createWallet(ownerId, {
        name: 'Pocket',
        initial_balance: 750,
      } as CreateWalletDto);

      expect(walletRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pocket', balance: 750, initial_balance: 750 }),
      );
      expect(result.balance).toBe(750);
    });
  });

  describe('updateWallet', () => {
    it('updates an owned wallet', async () => {
      const updated = { ...baseWallet, minimum_balance: 100 };
      walletRepo.findOne.mockResolvedValue(baseWallet);
      walletRepo.save.mockResolvedValue(updated);

      const result = await service.updateWallet('w-1', ownerId, {
        minimum_balance: 100,
      } as UpdateWalletDto);

      expect(result.minimum_balance).toBe(100);
    });

    it('throws NotFound for another user wallet', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateWallet('w-1', 'other-owner', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createWalletTransaction', () => {
    const dto: CreateWalletTransactionDto = {
      kind: 'spend',
      amount: 300,
    };

    it('creates a wallet spend and reduces the wallet balance', async () => {
      const wallet = { ...baseWallet, balance: 1000 };
      manager.findOne.mockResolvedValue(wallet);
      manager.save.mockResolvedValue(wallet);
      const created = { ...baseWallet, id: 'wt-1', wallet_id: 'w-1', amount: 300 } as any;
      manager.findOne.mockResolvedValueOnce(wallet).mockResolvedValueOnce(created);

      const result = await service.createWalletTransaction(ownerId, 'w-1', dto);

      expect(wallet.balance).toBe(700);
      expect(manager.save).toHaveBeenCalledWith(wallet);
      expect(result.amount).toBe(300);
    });

    it('rejects a spend larger than wallet balance', async () => {
      const wallet = { ...baseWallet, balance: 100 };
      manager.findOne.mockResolvedValue(wallet);
      await expect(
        service.createWalletTransaction(ownerId, 'w-1', { ...dto, amount: 500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive amount', async () => {
      await expect(
        service.createWalletTransaction(ownerId, 'w-1', { ...dto, amount: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteWalletTransaction', () => {
    it('reverts a wallet spend (increases balance) before deleting', async () => {
      const current = {
        id: 'wt-1',
        wallet_id: 'w-1',
        owner_id: ownerId,
        kind: 'spend',
        amount: 300,
        bank_account_id: null,
        credit_transaction_id: null,
        debit_transaction_id: 't-debit',
      } as any;
      const wallet = { ...baseWallet, balance: 700 };
      manager.findOne
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(wallet);
      manager.query.mockResolvedValue(undefined);
      manager.save.mockResolvedValue(wallet);

      await service.deleteWalletTransaction(ownerId, 'wt-1');

      // Removing a spend increases balance
      expect(wallet.balance).toBe(1000);
      expect(wallet.balance).toBe(1000);
    });

    it('throws NotFound for another user wallet transaction', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.deleteWalletTransaction(ownerId, 'wt-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
