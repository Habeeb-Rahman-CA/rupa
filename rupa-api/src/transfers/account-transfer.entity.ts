import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

@Entity('transfers')
export class AccountTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  source_account_id: string;

  @Column({ type: 'uuid' })
  destination_account_id: string;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'date' })
  occurred_on: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  debit_transaction_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  credit_transaction_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
