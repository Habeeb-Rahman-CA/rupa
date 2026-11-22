import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './bank-account.entity.js';
import { BankAccountsController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount])],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
