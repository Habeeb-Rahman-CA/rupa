import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type EventStatus = 'open' | 'settled';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kind: string | null;

  @Column({ type: 'date' })
  starts_on: Date;

  @Column({ type: 'date', nullable: true })
  ends_on: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: EventStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('event_participants')
export class EventParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  event_id: string;

  @Column({ type: 'uuid', nullable: true })
  person_id: string | null;

  @Column({ type: 'boolean', default: false })
  is_you: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('event_expenses')
export class EventExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  event_id: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

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

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('event_expense_participants')
export class EventExpenseParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  event_expense_id: string;

  @Column({ type: 'uuid' })
  event_participant_id: string;
}

@Entity('event_settlements')
export class EventSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  event_id: string;

  @Column({ type: 'uuid' })
  event_participant_id: string;

  @Column({ type: 'date' })
  paid_on: Date;

  @Column({ type: 'uuid' })
  transaction_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
