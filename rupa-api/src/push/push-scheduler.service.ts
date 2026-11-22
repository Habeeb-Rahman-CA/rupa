import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service.js';

@Injectable()
export class PushSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PushSchedulerService.name);
  private cronStarted = false;

  constructor(
    private readonly pushService: PushService,
    private readonly configService: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.configService.get<string>('push.timeZone') ?? 'Asia/Kolkata';
  }

  onModuleInit(): void {
    this.logger.log(`Push scheduler configured for timezone ${this.timeZone}`);
  }

  /**
   * Runs every 15 minutes (cron: star-15 star star star star) in Asia/Kolkata
   * timezone. Executes all scheduled push categories: renewals, low balance,
   * budget thresholds, daily expense summary (8 AM), daily confirm reminder
   * (10 PM).
   */
  @Cron('*/15 * * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleScheduledPush(): Promise<void> {
    if (this.cronStarted) {
      this.logger.warn('push: scheduled run already in progress, skipping');
      return;
    }
    this.cronStarted = true;
    try {
      const result = await this.pushService.runScheduled();
      this.logger.log(
        `push: scheduled run complete candidates=${result.candidates} claimed=${result.claimed} sent=${result.sent}`,
      );
    } catch (err) {
      this.logger.error('push: scheduled run failed', err);
    } finally {
      this.cronStarted = false;
    }
  }
}
