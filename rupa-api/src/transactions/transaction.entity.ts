import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type TxDirection = 'in' | 'out';
export type TxSource =
  | 'manual'
  | 'debt'
  | 'event'
  | 'settlement'
  | 'opening'
  | 'transfer'
  | 'wallet_recharge'
  | 'wallet_spend'
  | 'subscription';

export type PaymentMode = 'cash' | 'bank';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'date' })
  occurred_on: Date;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  direction: TxDirection;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20 })
  source: TxSource;

  @Column({ type: 'uuid', nullable: true })
  source_ref_id: string | null;

  @Column({ type: 'varchar', length: 10, default: 'cash' })
  payment_mode: PaymentMode;

  @Column({ type: 'uuid', nullable: true })
  bank_account_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  wallet_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
