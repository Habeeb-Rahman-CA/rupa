import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type WalletKind = 'cash' | 'bank' | 'upi' | 'card' | 'investment' | 'other';
export type WalletTxKind = 'recharge' | 'spend';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    default: 0,
    transformer: MoneyTransformer,
  })
  initial_balance: number;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    default: 0,
    transformer: MoneyTransformer,
  })
  balance: number;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    default: 0,
    transformer: MoneyTransformer,
  })
  minimum_balance: number;

  @Column({ type: 'varchar', length: 20, default: 'cash' })
  kind: WalletKind;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  wallet_id: string;

  @Column({ type: 'varchar', length: 10 })
  kind: WalletTxKind;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'date' })
  occurred_on: Date;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  funding_mode: 'cash' | 'bank' | null;

  @Column({ type: 'uuid', nullable: true })
  bank_account_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  debit_transaction_id: string;

  @Column({ type: 'uuid', nullable: true })
  credit_transaction_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
