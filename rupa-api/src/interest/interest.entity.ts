import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type InterestStage = 'received' | 'separated' | 'disposed';

/**
 * Interest (Riba) tracker.
 *
 * Deliberately isolated from personal finance: these two tables are never
 * joined to `transactions`, categories, or bank-account balances, so recorded
 * interest can never leak into income, expenses, savings, budgets, the
 * dashboard balance, or reports.
 */
@Entity('interest_entries')
export class InterestEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  bank_account_id: string;

  @Column({ type: 'date' })
  occurred_on: Date;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'received' })
  stage: InterestStage;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity('interest_disposals')
export class InterestDisposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  entry_id: string;

  @Column({ type: 'date' })
  occurred_on: Date;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * `interest_disposals.entry_id` -> `interest_entries.id` ON DELETE CASCADE
   * (mirrors db/postgres/migrations/0020). Declared as a relation so
   * `synchronize` reproduces the same FK behaviour as the SQL migrations.
   */
  @ManyToOne(() => InterestEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: InterestEntry;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
