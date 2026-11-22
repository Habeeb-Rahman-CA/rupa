import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Event,
  EventParticipant,
  EventExpense,
  EventExpenseParticipant,
  EventSettlement,
} from './events.entity.js';
import { Transaction } from '../transactions/transaction.entity.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventParticipant,
      EventExpense,
      EventExpenseParticipant,
      EventSettlement,
      Transaction,
    ]),
    TransactionsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
