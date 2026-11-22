import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Subscription,
  SubscriptionPayment,
  SubscriptionRenewal,
  SubscriptionPriceChange,
} from './subscriptions.entity.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionPayment,
      SubscriptionRenewal,
      SubscriptionPriceChange,
    ]),
    TransactionsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
