import { ApiProperty } from '@nestjs/swagger';

export class PushSubscriptionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid' })
  owner_id: string;

  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/...' })
  endpoint: string;

  @ApiProperty({ example: 'Chrome/120.0', nullable: true })
  user_agent: string | null;

  @ApiProperty({ example: '2026-11-20T10:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-11-20T10:00:00Z' })
  updated_at: Date;
}

export class PushSendResultDto {
  @ApiProperty({ example: 'scheduled' })
  mode: string;

  @ApiProperty({ example: 5 })
  candidates: number;

  @ApiProperty({ example: 3 })
  claimed: number;

  @ApiProperty({ example: 3 })
  sent: number;
}

export class PushTestResultDto {
  @ApiProperty({ example: 'test' })
  mode: string;

  @ApiProperty({ example: 1 })
  devices: number;

  @ApiProperty({ example: 1 })
  sent: number;
}

export class PushSubscribeResultDto {
  @ApiProperty({ example: 'subscribed' })
  status: string;

  @ApiProperty({ example: 'uuid' })
  subscription_id: string;
}
