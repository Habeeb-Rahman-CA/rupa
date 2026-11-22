import {
  IsNotEmpty,
  IsIn,
  IsPositive,
  IsOptional,
  Min,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type {
  BillingCycle,
  SubscriptionStatus,
  SubscriptionTheme,
} from '../subscriptions.entity.js';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'Netflix' })
  @IsNotEmpty({ message: 'Subscription name is required.' })
  @Transform(({ value }) => trimValue(value))
  @MinLength(1, { message: 'Subscription name is required.' })
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Entertainment' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(100)
  category?: string;

  @ApiProperty({ example: 14.99 })
  @IsPositive({ message: 'Amount must be greater than zero.' })
  amount: number;

  @ApiProperty({ example: 'monthly', enum: ['weekly', 'monthly', 'quarterly', 'yearly'] })
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly'])
  billing_cycle: BillingCycle;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  next_renewal_date?: string;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  end_date?: string;

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  payment_account_id?: string | null;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  auto_renewal?: boolean;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'paused', 'cancelled', 'expired'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'paused', 'cancelled', 'expired'])
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ example: 'slate', enum: ['slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'], default: 'slate' })
  @IsOptional()
  @IsIn(['slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'])
  theme?: SubscriptionTheme;

  @ApiPropertyOptional({ example: 'Monthly plan' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Cancellation date; defaults to today when status is cancelled' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cancelled_on?: string | null;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1, { message: 'Subscription name is required.' })
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 15.99 })
  @IsOptional()
  @IsPositive({ message: 'Amount must be greater than zero.' })
  amount?: number;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly', 'quarterly', 'yearly'] })
  @IsOptional()
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly'])
  billing_cycle?: BillingCycle;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  next_renewal_date?: string;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  end_date?: string;

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  payment_account_id?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  auto_renewal?: boolean;

  @ApiPropertyOptional({ enum: ['active', 'paused', 'cancelled', 'expired'] })
  @IsOptional()
  @IsIn(['active', 'paused', 'cancelled', 'expired'])
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: ['slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'] })
  @IsOptional()
  @IsIn(['slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'])
  theme?: SubscriptionTheme;

  @ApiPropertyOptional({ example: 'Updated plan' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Cancellation date; defaults to today when status becomes cancelled' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cancelled_on?: string | null;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Effective date recorded on the price-change history row' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  price_change_effective_on?: string;
}

export class SubscriptionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() category: string;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: ['weekly', 'monthly', 'quarterly', 'yearly'] }) billing_cycle: BillingCycle;
  @ApiProperty({ example: '2026-11-01' }) start_date: string;
  @ApiProperty({ example: '2026-12-01' }) next_renewal_date: string;
  @ApiPropertyOptional() end_date: string | null;
  @ApiPropertyOptional() payment_account_id: string | null;
  @ApiProperty() auto_renewal: boolean;
  @ApiProperty({ enum: ['active', 'paused', 'cancelled', 'expired'] }) status: SubscriptionStatus;
  @ApiProperty({ enum: ['slate', 'mint', 'neon', 'rose', 'amber', 'scarlet', 'violet'] }) theme: SubscriptionTheme;
  @ApiPropertyOptional() cancelled_on: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 14.99 })
  @IsPositive({ message: 'Payment amount must be greater than zero.' })
  amount: number;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  paid_on?: string;

  @ApiPropertyOptional({ example: 'Monthly payment' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank'] })
  @IsOptional()
  @IsIn(['cash', 'bank'])
  payment_mode?: 'cash' | 'bank';

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string | null;

  @ApiPropertyOptional({
    example: 'transaction-uuid',
    description: 'Link an existing expense transaction instead of creating one',
  })
  @IsOptional()
  @IsUUID('4')
  transaction_id?: string | null;

  @ApiPropertyOptional({
    example: '2027-12-01',
    description: 'New expiry date after this renewal; drives both end_date and next_renewal_date',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  new_expiry_date?: string;

  @ApiPropertyOptional({ example: 'idempotency-request-uuid' })
  @IsOptional()
  @IsUUID('4')
  request_id?: string | null;
}

export class SubscriptionRenewalResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() subscription_id: string;
  @ApiProperty({ example: '2026-12-01' }) due_on: string;
  @ApiProperty({ example: '2026-12-01' }) renewed_on: string;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: ['completed', 'skipped'] }) status: 'completed' | 'skipped';
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
}

export class SubscriptionPriceChangeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() subscription_id: string;
  @ApiProperty() old_amount: number;
  @ApiProperty() new_amount: number;
  @ApiProperty({ example: '2026-12-01' }) effective_on: string;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
}

export class SubscriptionPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() subscription_id: string;
  @ApiPropertyOptional() renewal_id: string | null;
  @ApiProperty() amount: number;
  @ApiProperty({ example: '2026-12-01' }) paid_on: string;
  @ApiPropertyOptional() transaction_id: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
}
