import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterestEntry, InterestDisposal } from './interest.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { InterestController } from './interest.controller.js';
import { InterestService } from './interest.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([InterestEntry, InterestDisposal, BankAccount])],
  controllers: [InterestController],
  providers: [InterestService],
  exports: [InterestService],
})
export class InterestModule {}
