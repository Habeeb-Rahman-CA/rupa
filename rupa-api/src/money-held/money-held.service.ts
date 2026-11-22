import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  MoneyHeldPerson,
  MoneyHeldTransaction,
} from './entities/money-held.entity.js';
import { Person } from '../people/person.entity.js';
import { BankAccount } from '../bank-accounts/bank-account.entity.js';
import { roundCurrency } from '../common/money-transformer.js';

@Injectable()
export class MoneyHeldService {
  constructor(
    @InjectRepository(MoneyHeldPerson)
    private readonly personRepository: Repository<MoneyHeldPerson>,
    @InjectRepository(MoneyHeldTransaction)
    private readonly transactionRepository: Repository<MoneyHeldTransaction>,
    @InjectRepository(Person)
    private readonly personEntityRepository: Repository<Person>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  async listPeople(ownerId: string): Promise<MoneyHeldPerson[]> {
    return this.personRepository.find({
      where: { owner_id: ownerId },
      order: { created_at: 'ASC' },
    });
  }

  async addPerson(ownerId: string, personId: string): Promise<MoneyHeldPerson> {
    const existing = await this.personRepository.findOne({
      where: { owner_id: ownerId, person_id: personId },
    });
    if (existing) return existing;

    const created = this.personRepository.create({
      owner_id: ownerId,
      person_id: personId,
    });
    return this.personRepository.save(created);
  }

  async listTransactions(ownerId: string): Promise<MoneyHeldTransaction[]> {
    return this.transactionRepository.find({
      where: { owner_id: ownerId },
      order: { occurred_on: 'DESC', created_at: 'DESC' },
    });
  }

  async listBalances(ownerId: string): Promise<Array<{
    id: string;
    personId: string;
    name: string;
    received: number;
    returned: number;
    outstanding: number;
  }>> {
    const people = await this.personEntityRepository.find({
      where: { owner_id: ownerId },
    });
    const heldPeople = await this.listPeople(ownerId);
    const transactions = await this.listTransactions(ownerId);

    return heldPeople.map((hp) => {
      const person = people.find((p) => p.id === hp.person_id);
      const personRecords = transactions.filter((t) => t.held_person_id === hp.id);
      const received = roundCurrency(
        personRecords.filter((r) => r.direction === 'received').reduce((s, r) => s + Number(r.amount), 0),
      );
      const returned = roundCurrency(
        personRecords.filter((r) => r.direction === 'returned').reduce((s, r) => s + Number(r.amount), 0),
      );
      return {
        id: hp.id,
        personId: hp.person_id,
        name: person?.name ?? 'Unknown person',
        received,
        returned,
        outstanding: roundCurrency(received - returned),
      };
    });
  }

  async record(
    ownerId: string,
    dto: any,
  ): Promise<MoneyHeldTransaction> {
    if (!(dto.amount > 0)) throw new BadRequestException('Amount must be greater than zero.');

    const heldPerson = await this.personRepository.findOne({
      where: { owner_id: ownerId, id: dto.held_person_id },
    });
    if (!heldPerson) throw new NotFoundException('Held-money person not found.');

    const outstanding = (await this.listBalances(ownerId)).find(
      (b) => b.id === dto.held_person_id,
    )?.outstanding ?? 0;

    if (dto.direction === 'returned' && dto.amount > outstanding + 0.000001) {
      throw new BadRequestException('Return amount cannot exceed the outstanding balance.');
    }

    const created = this.transactionRepository.create({
      owner_id: ownerId,
      held_person_id: dto.held_person_id,
      direction: dto.direction,
      amount: dto.amount,
      occurred_on: dto.occurred_on,
      payment_mode: dto.payment_mode ?? 'cash',
      bank_account_id: dto.bank_account_id ?? null,
      notes: dto.notes?.trim() || null,
    });
    const saved = await this.transactionRepository.save(created);

    // Adjust bank balance if payment mode is bank
    if (dto.payment_mode === 'bank' && dto.bank_account_id) {
      const account = await this.bankAccountRepository.findOne({
        where: { id: dto.bank_account_id, owner_id: ownerId },
      });
      if (account && account.balance !== undefined) {
        const directionSign = dto.direction === 'received' ? 1 : -1;
        account.balance = roundCurrency(account.balance + directionSign * Number(dto.amount));
        await this.bankAccountRepository.save(account);
      }
    }

    return saved;
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const record = await this.transactionRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!record) return;

    const balances = await this.listBalances(ownerId);
    if (record.direction === 'received') {
      const balance = balances.find((b) => b.id === record.held_person_id);
      const remainingReceived = (balance?.received ?? 0) - Number(record.amount);
      if (remainingReceived + 0.000001 < (balance?.returned ?? 0)) {
        throw new BadRequestException('Delete returned records first before deleting this receipt.');
      }
    }

    // Adjust bank balance
    if (record.payment_mode === 'bank' && record.bank_account_id) {
      const account = await this.bankAccountRepository.findOne({
        where: { id: record.bank_account_id, owner_id: ownerId },
      });
      if (account && account.balance !== undefined) {
        const directionSign = record.direction === 'received' ? 1 : -1;
        account.balance = roundCurrency(account.balance - directionSign * Number(record.amount));
        await this.bankAccountRepository.save(account);
      }
    }

    await this.transactionRepository.delete(id);
  }
}
