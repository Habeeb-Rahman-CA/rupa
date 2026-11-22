import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PushSubscription } from './entities/push-subscription.entity.js';
import { PushPreference } from './entities/push-preference.entity.js';
import { PushNotificationLog } from './entities/push-notification-log.entity.js';
import { PushService } from './push.service.js';
import { PushSchedulerService } from './push-scheduler.service.js';
import { PushController } from './push.controller.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      PushSubscription,
      PushPreference,
      PushNotificationLog,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [PushController],
  providers: [PushService, PushSchedulerService],
  exports: [PushService],
})
export class PushModule {}
