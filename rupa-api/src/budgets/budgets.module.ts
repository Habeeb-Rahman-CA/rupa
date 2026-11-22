import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './budget.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Budget, Transaction])],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
