import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type PushCategory =
  | 'renewals'
  | 'low_balance'
  | 'budget'
  | 'daily_expense'
  | 'daily_confirm';

@Entity('push_notification_log')
export class PushNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 20 })
  category: PushCategory;

  @Column({ type: 'text' })
  ref: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
