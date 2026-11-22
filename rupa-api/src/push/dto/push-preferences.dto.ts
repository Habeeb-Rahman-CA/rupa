import {
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import type { PushCategory } from '../entities/push-preference.entity.js';

export class PushPreferenceItemDto {
  @ApiProperty({ enum: ['renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm'], example: 'renewals' })
  @IsIn(['renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm'])
  category: PushCategory;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}

export class UpdatePushPreferencesDto {
  @ApiProperty({ type: [PushPreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushPreferenceItemDto)
  preferences: PushPreferenceItemDto[];
}

export class PushPreferenceResponseDto {
  @ApiProperty({ example: 'renewals' })
  category: PushCategory;

  @ApiProperty({ example: true })
  enabled: boolean;
}
