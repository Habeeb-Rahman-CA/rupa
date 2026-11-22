import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountTransfer } from './account-transfer.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountTransfer, BankAccount, Transaction]),
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
