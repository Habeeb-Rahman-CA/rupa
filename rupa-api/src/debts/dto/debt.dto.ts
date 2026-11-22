import {
  IsNotEmpty,
  IsIn,
  IsPositive,
  IsOptional,
  Min,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { DebtDirection } from '../debts.entity.js';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export type DebtTransactionImpact = 'default' | 'income' | 'expense' | 'none';

export class CreateDebtDto {
  @ApiProperty({ example: 'person-uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  person_id: string;

  @ApiProperty({ example: 'they_owe', enum: ['i_owe', 'they_owe'] })
  @IsIn(['i_owe', 'they_owe'])
  direction: DebtDirection;

  @ApiProperty({ example: 5000 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Personal loan' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  reason?: string | null;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  opened_on?: string;

  @ApiPropertyOptional({ example: 'default', enum: ['default', 'income', 'expense', 'none'], default: 'default' })
  @IsOptional()
  @IsIn(['default', 'income', 'expense', 'none'])
  impact?: DebtTransactionImpact;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank'] })
  @IsOptional()
  @IsIn(['cash', 'bank'])
  payment_mode?: 'cash' | 'bank';

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string | null;
}

export class AddPaymentDto {
  @ApiProperty({ example: 1000 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-15' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  paid_on?: string;

  @ApiPropertyOptional({ example: 'Cash repayment' })
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
}

export class DebtResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() person_id: string;
  @ApiProperty({ enum: ['i_owe', 'they_owe'] }) direction: DebtDirection;
  @ApiProperty() principal: number;
  @ApiProperty() outstanding: number;
  @ApiPropertyOptional() reason: string | null;
  @ApiProperty({ example: '2026-11-01' }) opened_on: string;
  @ApiPropertyOptional() closed_on: string | null;
  @ApiProperty() created_at: Date;
}

export class DebtPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() debt_id: string;
  @ApiProperty() amount: number;
  @ApiProperty({ example: '2026-11-15' }) paid_on: string;
  @ApiProperty() transaction_id: string;
  @ApiPropertyOptional() notes: string | null;
}
