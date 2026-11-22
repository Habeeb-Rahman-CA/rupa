import {
  IsNotEmpty,
  IsIn,
  IsPositive,
  Min,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TxDirection, TxSource, PaymentMode } from '../transaction.entity.js';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateTransactionDto {
  @ApiProperty({ example: 1250.5 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'out', enum: ['in', 'out'] })
  @IsIn(['in', 'out'])
  direction: TxDirection;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'cat-uuid' })
  @IsOptional()
  @IsUUID('4')
  category_id?: string | null;

  @ApiPropertyOptional({ example: 'Groceries' })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  notes?: string | null;

  @ApiPropertyOptional({ example: 'manual', enum: ['manual', 'debt', 'event', 'settlement', 'opening', 'transfer', 'wallet_recharge', 'wallet_spend', 'subscription'] })
  @IsOptional()
  @IsIn([
    'manual',
    'debt',
    'event',
    'settlement',
    'opening',
    'transfer',
    'wallet_recharge',
    'wallet_spend',
    'subscription',
  ])
  source?: TxSource;

  @ApiPropertyOptional({ example: 'ref-uuid' })
  @IsOptional()
  @IsUUID('4')
  source_ref_id?: string | null;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank'] })
  @IsOptional()
  @IsIn(['cash', 'bank'])
  payment_mode?: PaymentMode;

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string | null;

  @ApiPropertyOptional({ example: 'wallet-uuid' })
  @IsOptional()
  @IsUUID('4')
  wallet_id?: string | null;
}

export class TransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty({ example: '2026-11-20' }) occurred_on: string;
  @ApiProperty({ example: 1250.5 }) amount: number;
  @ApiProperty({ enum: ['in', 'out'] }) direction: TxDirection;
  @ApiPropertyOptional() category_id: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() source: TxSource;
  @ApiPropertyOptional() source_ref_id: string | null;
  @ApiProperty({ enum: ['cash', 'bank'] }) payment_mode: PaymentMode;
  @ApiPropertyOptional() bank_account_id: string | null;
  @ApiPropertyOptional() wallet_id: string | null;
  @ApiProperty({ example: '2026-11-20T03:27:24Z' }) created_at: Date;
}

export class OpeningBalanceDto {
  @ApiProperty({ example: 3000 }) balance: number;
}
