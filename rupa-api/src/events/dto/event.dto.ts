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
import type { EventStatus } from '../events.entity.js';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Weekend trip to Goa' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'trip' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(100)
  kind?: string | null;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  starts_on?: string;

  @ApiPropertyOptional({ example: '2026-12-22' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  ends_on?: string | null;

  @ApiPropertyOptional({ example: 'Friends trip' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class EventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() kind: string | null;
  @ApiProperty({ example: '2026-12-20' }) starts_on: string;
  @ApiPropertyOptional() ends_on: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty({ enum: ['open', 'settled'] }) status: EventStatus;
  @ApiProperty() created_at: Date;
  @ApiProperty() participants: any[];
  @ApiProperty() expenses: any[];
  @ApiProperty() settlements: any[];
}

export class AddParticipantDto {
  @ApiPropertyOptional({ example: 'person-uuid' })
  @IsOptional()
  @IsUUID('4')
  person_id?: string | null;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  is_you?: boolean;
}

export class EventParticipantResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() event_id: string;
  @ApiPropertyOptional() person_id: string | null;
  @ApiProperty() is_you: boolean;
}

export class AddExpenseDto {
  @ApiProperty({ example: 'Dinner at beach shack' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  description: string;

  @ApiProperty({ example: 1200 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  paid_on?: string;
}

export class EventExpenseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() event_id: string;
  @ApiProperty() description: string;
  @ApiProperty() amount: number;
  @ApiProperty({ example: '2026-12-20' }) paid_on: string;
  @ApiPropertyOptional() transaction_id: string | null;
}

export class RecordSettlementDto {
  @ApiProperty({ example: 'expense-uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  event_expense_id: string;

  @ApiProperty({ example: 'participant-uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  event_participant_id: string;

  @ApiProperty({ example: 400 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '2026-12-21' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  paid_on?: string;

  @ApiProperty({ example: 'you_paid', enum: ['you_paid', 'you_received'] })
  @IsIn(['you_paid', 'you_received'])
  direction: 'you_paid' | 'you_received';

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank'] })
  @IsOptional()
  @IsIn(['cash', 'bank'])
  payment_mode?: 'cash' | 'bank';

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string | null;

  @ApiPropertyOptional({ example: 'Settled dinner share' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class EventSettlementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() event_id: string;
  @ApiProperty() event_participant_id: string;
  @ApiProperty({ example: '2026-12-21' }) paid_on: string;
  @ApiProperty() transaction_id: string;
}
