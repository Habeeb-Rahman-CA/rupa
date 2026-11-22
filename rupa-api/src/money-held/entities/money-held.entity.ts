import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type MoneyHeldDirection = 'received' | 'returned';

@Entity('money_held_people')
export class MoneyHeldPerson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  person_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('money_held_transactions')
export class MoneyHeldTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  held_person_id: string;

  @Column({ type: 'varchar', length: 10 })
  direction: MoneyHeldDirection;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  occurred_on: string;

  @Column({ type: 'varchar', length: 10 })
  payment_mode: string;

  @Column({ type: 'uuid', nullable: true })
  bank_account_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
