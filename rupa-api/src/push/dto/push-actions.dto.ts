import {
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestPushDto {
  @ApiProperty({ example: 'test', required: false })
  @IsString()
  @IsOptional()
  action?: string;
}

export class ScheduledPushDto {
  @ApiProperty({ example: 'cron-secret-value' })
  @IsString()
  @IsNotEmpty()
  cron_secret: string;
}
