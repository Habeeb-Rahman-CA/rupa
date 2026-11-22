import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { MoneyTransformer } from '../common/money-transformer.js';

export type CardType = 'debit' | 'credit' | 'savings' | 'current' | 'prepaid';
export type PaymentNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'discover';
export type CardTheme =
  | 'blue'
  | 'purple'
  | 'dark'
  | 'emerald'
  | 'sunset'
  | 'gold'
  | 'rose';

const CARD_TYPES: CardType[] = ['debit', 'credit', 'savings', 'current', 'prepaid'];
const PAYMENT_NETWORKS: PaymentNetwork[] = ['visa', 'mastercard', 'rupay', 'amex', 'discover'];
const CARD_THEMES: CardTheme[] = ['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'];

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  bank_name: string;

  @Column({ type: 'varchar', length: 255 })
  account_name: string;

  @Column({ type: 'varchar', length: 20 })
  card_type: CardType;

  @Column({ type: 'varchar', length: 20 })
  payment_network: PaymentNetwork;

  @Column({ type: 'varchar', length: 50 })
  card_number_masked: string;

  @Column({ type: 'varchar', length: 20 })
  expiry_date: string;

  @Column({ type: 'varchar', length: 255 })
  cardholder_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  account_number_masked: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ifsc_code: string | null;

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
    nullable: true,
    transformer: MoneyTransformer,
  })
  credit_limit: number | null;

  @Column({ type: 'varchar', length: 20, default: 'blue' })
  theme: CardTheme;

  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  static cardTypes(): CardType[] {
    return CARD_TYPES;
  }

  static paymentNetworks(): PaymentNetwork[] {
    return PAYMENT_NETWORKS;
  }

  static cardThemes(): CardTheme[] {
    return CARD_THEMES;
  }
}
