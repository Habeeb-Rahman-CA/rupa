import {
  IsNotEmpty,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { CategoryKind } from '../categories.entity.js';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Food' })
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'expense', enum: ['income', 'expense', 'savings'] })
  @IsIn(['income', 'expense', 'savings'])
  kind: CategoryKind;
}

export class CategoryResponseDto {
  @ApiProperty({ example: 'c8f7e3a2-1111-4444-8888-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'owner-uuid' })
  owner_id: string;

  @ApiProperty({ example: 'Food' })
  name: string;

  @ApiProperty({ example: 'expense', enum: ['income', 'expense', 'savings'] })
  kind: CategoryKind;

  @ApiProperty({ example: '2026-11-20T03:27:24Z' })
  created_at: Date;
}
