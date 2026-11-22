import {
  IsNotEmpty,
  IsIn,
  IsPositive,
  Min,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { WalletKind, WalletTxKind } from '../wallets.entity.js';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWalletDto {
  @ApiProperty({ example: 'Pocket Cash' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 1000, default: 0 })
  @IsOptional()
  @Min(0)
  initial_balance?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Min(0)
  minimum_balance?: number;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank', 'upi', 'card', 'investment', 'other'], default: 'cash' })
  @IsOptional()
  @IsIn(['cash', 'bank', 'upi', 'card', 'investment', 'other'])
  kind?: WalletKind;
}

export class UpdateWalletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Min(0)
  minimum_balance?: number;
}

export class WalletResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() name: string;
  @ApiProperty() initial_balance: number;
  @ApiProperty() balance: number;
  @ApiProperty() minimum_balance: number;
  @ApiProperty({ enum: ['cash', 'bank', 'upi', 'card', 'investment', 'other'] }) kind: WalletKind;
  @ApiProperty() created_at: Date;
}

export class CreateWalletTransactionDto {
  @ApiProperty({ example: 'recharge', enum: ['recharge', 'spend'] })
  @IsIn(['recharge', 'spend'])
  kind: WalletTxKind;

  @ApiProperty({ example: 500 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank'] })
  @IsOptional()
  @IsIn(['cash', 'bank'])
  funding_mode?: 'cash' | 'bank' | null;

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string | null;

  @ApiPropertyOptional({ example: 'Notes' })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  notes?: string | null;

  @ApiPropertyOptional({ example: 'idempotency-request-uuid' })
  @IsOptional()
  @IsUUID('4')
  request_id?: string | null;
}

export class WalletTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() wallet_id: string;
  @ApiProperty({ enum: ['recharge', 'spend'] }) kind: WalletTxKind;
  @ApiProperty() amount: number;
  @ApiProperty({ example: '2026-11-20' }) occurred_on: string;
  @ApiPropertyOptional() category_id: string | null;
  @ApiPropertyOptional({ enum: ['cash', 'bank'] }) funding_mode: 'cash' | 'bank' | null;
  @ApiPropertyOptional() bank_account_id: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() debit_transaction_id: string;
  @ApiPropertyOptional() credit_transaction_id: string | null;
  @ApiProperty() created_at: Date;
}
