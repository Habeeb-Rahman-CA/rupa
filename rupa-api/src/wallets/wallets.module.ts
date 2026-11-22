import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './wallets.entity.js';
import { WalletTransaction } from './wallets.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, WalletTransaction, BankAccount])],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
