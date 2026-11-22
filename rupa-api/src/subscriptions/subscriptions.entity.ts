import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired';
export type SubscriptionTheme =
  | 'slate'
  | 'mint'
  | 'neon'
  | 'rose'
  | 'amber'
  | 'scarlet'
  | 'violet';
export type SubscriptionRenewalStatus = 'completed' | 'skipped';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, default: 'Other' })
  category: string;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  billing_cycle: BillingCycle;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  next_renewal_date: Date;

  @Column({ type: 'date', nullable: true })
  end_date: Date | null;

  @Column({ type: 'uuid', nullable: true })
  payment_account_id: string | null;

  @Column({ type: 'boolean', default: true })
  auto_renewal: boolean;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', length: 20, default: 'slate' })
  theme: SubscriptionTheme;

  @Column({ type: 'date', nullable: true })
  cancelled_on: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity('subscription_payments')
export class SubscriptionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  subscription_id: string;

  @Column({ type: 'uuid', nullable: true })
  renewal_id: string | null;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'date' })
  paid_on: Date;

  @Column({ type: 'uuid', nullable: true })
  transaction_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('subscription_renewals')
export class SubscriptionRenewal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  subscription_id: string;

  @Column({ type: 'date' })
  due_on: Date;

  @Column({ type: 'date' })
  renewed_on: Date;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: SubscriptionRenewalStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('subscription_price_changes')
export class SubscriptionPriceChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  subscription_id: string;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  old_amount: number;

  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: MoneyTransformer,
  })
  new_amount: number;

  @Column({ type: 'date' })
  effective_on: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
