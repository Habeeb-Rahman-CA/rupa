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
import type { BudgetPeriod } from '../budget.entity.js';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBudgetDto {
  @ApiProperty({ example: 'Groceries monthly' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'cat-uuid' })
  @IsOptional()
  @IsUUID('4')
  category_id?: string | null;

  @ApiProperty({ example: 4000 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'monthly', enum: ['weekly', 'monthly', 'yearly', 'custom'], default: 'monthly' })
  @IsOptional()
  @IsIn(['weekly', 'monthly', 'yearly', 'custom'])
  period?: BudgetPeriod;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  end_date?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  recurring?: boolean;

  @ApiPropertyOptional({ example: [50, 75, 90, 100] })
  @IsOptional()
  thresholds?: number[];
}

export class UpdateBudgetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'cat-uuid' })
  @IsOptional()
  @IsUUID('4')
  category_id?: string | null;

  @ApiPropertyOptional({ example: 4500 })
  @IsOptional()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly', 'yearly', 'custom'] })
  @IsOptional()
  @IsIn(['weekly', 'monthly', 'yearly', 'custom'])
  period?: BudgetPeriod;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  end_date?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  recurring?: boolean;

  @ApiPropertyOptional({ example: [50, 75, 90, 100] })
  @IsOptional()
  thresholds?: number[];
}

export type BudgetStatus = 'on_track' | 'near_limit' | 'exceeded';

export class BudgetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() category_id: string | null;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: ['weekly', 'monthly', 'yearly', 'custom'] }) period: BudgetPeriod;
  @ApiProperty({ example: '2026-11-01' }) start_date: string;
  @ApiProperty({ example: '2026-11-30' }) end_date: string;
  @ApiProperty() recurring: boolean;
  @ApiProperty() thresholds: number[];
  @ApiProperty() spent: number;
  @ApiProperty() remaining: number;
  @ApiProperty() percentage: number;
  @ApiProperty({ enum: ['on_track', 'near_limit', 'exceeded'] }) status: BudgetStatus;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}
