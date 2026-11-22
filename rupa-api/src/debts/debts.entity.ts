import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type DebtDirection = 'i_owe' | 'they_owe';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  person_id: string;

  @Column({ type: 'varchar', length: 10 })
  direction: DebtDirection;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  principal: number;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  outstanding: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'date' })
  opened_on: Date;

  @Column({ type: 'date', nullable: true })
  closed_on: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('debt_payments')
export class DebtPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  debt_id: string;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'date' })
  paid_on: Date;

  @Column({ type: 'uuid' })
  transaction_id: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
