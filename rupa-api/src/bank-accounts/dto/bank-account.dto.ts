import {
  IsNotEmpty,
  IsIn,
  MinLength,
  MaxLength,
  IsOptional,
  IsPositive,
  Min,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type {
  CardType,
  PaymentNetwork,
  CardTheme,
} from '../bank-account.entity.js';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBankAccountDto {
  @ApiProperty({ example: 'HDFC Bank' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  bank_name: string;

  @ApiProperty({ example: 'Salary Account' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  account_name: string;

  @ApiProperty({ example: 'debit', enum: ['debit', 'credit', 'savings', 'current', 'prepaid'] })
  @IsIn(['debit', 'credit', 'savings', 'current', 'prepaid'])
  card_type: CardType;

  @ApiProperty({ example: 'visa', enum: ['visa', 'mastercard', 'rupay', 'amex', 'discover'] })
  @IsIn(['visa', 'mastercard', 'rupay', 'amex', 'discover'])
  payment_network: PaymentNetwork;

  @ApiProperty({ example: '4329' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(50)
  card_number_masked: string;

  @ApiProperty({ example: '12/28' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(20)
  expiry_date: string;

  @ApiProperty({ example: 'PRIMARY HOLDER' })
  @IsNotEmpty()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  cardholder_name: string;

  @ApiPropertyOptional({ example: '1234 5678 **** 9012' })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MaxLength(50)
  account_number_masked?: string | null;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MaxLength(20)
  ifsc_code?: string | null;

  @ApiPropertyOptional({ example: 5000, default: 0 })
  @IsOptional()
  @Min(0)
  balance?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Min(0)
  credit_limit?: number | null;

  @ApiPropertyOptional({ example: 'blue', enum: ['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'], default: 'blue' })
  @IsOptional()
  @IsIn(['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'])
  theme?: CardTheme;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  is_primary?: boolean;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  account_name?: string;

  @ApiPropertyOptional({ enum: ['debit', 'credit', 'savings', 'current', 'prepaid'] })
  @IsOptional()
  @IsIn(['debit', 'credit', 'savings', 'current', 'prepaid'])
  card_type?: CardType;

  @ApiPropertyOptional({ enum: ['visa', 'mastercard', 'rupay', 'amex', 'discover'] })
  @IsOptional()
  @IsIn(['visa', 'mastercard', 'rupay', 'amex', 'discover'])
  payment_network?: PaymentNetwork;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(50)
  card_number_masked?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(20)
  expiry_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MinLength(1)
  @MaxLength(255)
  cardholder_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MaxLength(50)
  account_number_masked?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @MaxLength(20)
  ifsc_code?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  balance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  credit_limit?: number | null;

  @ApiPropertyOptional({ enum: ['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'] })
  @IsOptional()
  @IsIn(['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'])
  theme?: CardTheme;

  @ApiPropertyOptional()
  @IsOptional()
  is_primary?: boolean;
}

export class BankAccountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() bank_name: string;
  @ApiProperty() account_name: string;
  @ApiProperty({ enum: ['debit', 'credit', 'savings', 'current', 'prepaid'] }) card_type: CardType;
  @ApiProperty({ enum: ['visa', 'mastercard', 'rupay', 'amex', 'discover'] }) payment_network: PaymentNetwork;
  @ApiProperty() card_number_masked: string;
  @ApiProperty() expiry_date: string;
  @ApiProperty() cardholder_name: string;
  @ApiPropertyOptional() account_number_masked: string | null;
  @ApiPropertyOptional() ifsc_code: string | null;
  @ApiProperty() balance: number;
  @ApiPropertyOptional() credit_limit: number | null;
  @ApiProperty({ enum: ['blue', 'purple', 'dark', 'emerald', 'sunset', 'gold', 'rose'] }) theme: CardTheme;
  @ApiProperty() is_primary: boolean;
  @ApiProperty() created_at: Date;
}

export class SetPrimaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() is_primary: boolean;
  @ApiProperty() message: string;
}
