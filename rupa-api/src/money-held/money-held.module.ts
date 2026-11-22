import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoneyHeldPerson } from './entities/money-held.entity.js';
import { MoneyHeldTransaction } from './entities/money-held.entity.js';
import { Person } from '../people/person.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { MoneyHeldController } from './money-held.controller.js';
import { MoneyHeldService } from './money-held.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([MoneyHeldPerson, MoneyHeldTransaction, Person, BankAccount]),
  ],
  controllers: [MoneyHeldController],
  providers: [MoneyHeldService],
  exports: [MoneyHeldService],
})
export class MoneyHeldModule {}
