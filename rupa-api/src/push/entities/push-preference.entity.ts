import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

export type PushCategory =
  | 'renewals'
  | 'low_balance'
  | 'budget'
  | 'daily_expense'
  | 'daily_confirm';

@Entity('push_preferences')
export class PushPreference {
  @PrimaryColumn({ type: 'uuid' })
  owner_id: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  category: PushCategory;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
