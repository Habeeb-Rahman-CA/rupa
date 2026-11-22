import {
  IsNotEmpty,
  IsIn,
  IsPositive,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { InterestStage } from '../interest.entity.js';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateInterestEntryDto {
  @ApiProperty({ example: 'bank-account-uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  bank_account_id: string;

  @ApiProperty({ example: 250.5 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'Q3 credit' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class InterestEntryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() bank_account_id: string;
  @ApiProperty({ example: '2026-11-20' }) occurred_on: string;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: ['received', 'separated', 'disposed'] }) stage: InterestStage;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class CreateInterestDisposalDto {
  @ApiProperty({ example: 500 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-25' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  occurred_on?: string;

  @ApiPropertyOptional({ example: 'Given to charity' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class InterestDisposalResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() entry_id: string;
  @ApiProperty({ example: '2026-11-25' }) occurred_on: string;
  @ApiProperty() amount: number;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class UpdateInterestEntryStageDto {
  @ApiProperty({ enum: ['received', 'separated', 'disposed'] })
  @IsIn(['received', 'separated', 'disposed'])
  stage: InterestStage;
}

export class InterestSummaryDto {
  @ApiProperty() totalReceived: number;
  @ApiProperty() totalDisposed: number;
  @ApiProperty() pendingBalance: number;
}
