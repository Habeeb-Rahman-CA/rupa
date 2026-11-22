import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MoneyHeldDirection } from '../entities/money-held.entity.js';

export class RecordMoneyHeldDto {
  @ApiPropertyOptional({ example: 'client-generated-uuid' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'person-uuid' })
  @IsUUID()
  held_person_id: string;

  @ApiProperty({ enum: ['received', 'returned'], example: 'received' })
  @IsIn(['received', 'returned'])
  direction: MoneyHeldDirection;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-10' })
  @IsDateString()
  @IsOptional()
  occurred_on?: string;

  @ApiPropertyOptional({ enum: ['cash', 'bank'], example: 'bank' })
  @IsIn(['cash', 'bank'])
  @IsOptional()
  payment_mode?: string;

  @ApiPropertyOptional({ example: 'bank-account-uuid' })
  @IsUUID()
  @IsOptional()
  bank_account_id?: string;

  @ApiPropertyOptional({ example: 'Returned to friend' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddMoneyHeldPersonDto {
  @ApiProperty({ example: 'person-uuid' })
  @IsUUID()
  person_id: string;
}

export class MoneyHeldPersonResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  owner_id: string;

  @ApiProperty()
  person_id: string;

  @ApiProperty()
  created_at: Date;
}

export class MoneyHeldTransactionResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  owner_id: string;

  @ApiProperty()
  held_person_id: string;

  @ApiProperty()
  direction: MoneyHeldDirection;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  occurred_on: string;

  @ApiProperty()
  payment_mode: string;

  @ApiPropertyOptional()
  bank_account_id: string | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  created_at: Date;
}

export class MoneyHeldBalanceResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  personId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  received: number;

  @ApiProperty()
  returned: number;

  @ApiProperty()
  outstanding: number;
}

export class DeleteMoneyHeldTransactionDto {
  @ApiProperty()
  id: string;
}
