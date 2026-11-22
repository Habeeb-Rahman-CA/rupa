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

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAccountTransferDto {
  @ApiProperty({ example: 'source-account-uuid' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  source_account_id: string;

  @ApiProperty({ example: 'destination-account-uuid' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  destination_account_id: string;

  @ApiProperty({ example: 750 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'Notes' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateAccountTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  source_account_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  destination_account_id?: string;

  @ApiPropertyOptional({ example: 750 })
  @IsOptional()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'Notes' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class AccountTransferResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() source_account_id: string;
  @ApiProperty() destination_account_id: string;
  @ApiProperty() amount: number;
  @ApiProperty({ example: '2026-11-20' }) occurred_on: string;
  @ApiPropertyOptional() notes: string | null;
  @ApiPropertyOptional() debit_transaction_id: string | null;
  @ApiPropertyOptional() credit_transaction_id: string | null;
  @ApiProperty() created_at: Date;
}
