import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Debt } from './debts.entity.js';
import { DebtPayment } from './debts.entity.js';
import { DebtsController } from './debts.controller.js';
import { DebtsService } from './debts.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Debt, DebtPayment]),
    TransactionsModule,
  ],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
