import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly' | 'custom';

@Entity('budgets')
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'monthly' })
  period: BudgetPeriod;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'boolean', default: false })
  recurring: boolean;

  @Column({ type: 'int', array: true, default: [50, 75, 90, 100] })
  thresholds: number[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
