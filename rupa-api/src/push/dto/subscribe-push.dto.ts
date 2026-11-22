import {
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribePushDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/...' })
  @IsNotEmpty()
  @IsString()
  endpoint: string;

  @ApiProperty({ example: 'BL...' })
  @IsNotEmpty()
  @IsString()
  p256dh: string;

  @ApiProperty({ example: 'ABC...' })
  @IsNotEmpty()
  @IsString()
  auth: string;

  @ApiProperty({ example: 'Chrome/120.0', required: false })
  @IsString()
  @IsOptional()
  user_agent?: string;
}
