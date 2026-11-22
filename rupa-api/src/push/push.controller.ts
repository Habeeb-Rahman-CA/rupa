import {
  Controller,
  Post,
  Delete,
  Get,
  Patch,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { PushService } from './push.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';
import { SubscribePushDto } from './dto/subscribe-push.dto.js';
import { UpdatePushPreferencesDto } from './dto/push-preferences.dto.js';
import {
  PushPreferenceResponseDto,
} from './dto/push-preferences.dto.js';
import {
  PushSubscriptionResponseDto,
  PushTestResultDto,
  PushSendResultDto,
  PushSubscribeResultDto,
} from './dto/push-response.dto.js';

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(
    @Inject(PushService)
    private readonly pushService: PushService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register a push subscription for the authenticated user' })
  @ApiResponse({ status: 201, description: 'Subscribed', type: PushSubscribeResultDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async subscribe(
    @Body() dto: SubscribePushDto,
    @User() user: Express.User & { id: string },
  ): Promise<PushSubscribeResultDto> {
    const { id } = await this.pushService.subscribe(user.id, {
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      user_agent: dto.user_agent,
    });
    return { status: 'subscribed', subscription_id: id };
  }

  @Delete('subscribe/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a push subscription (must own it)' })
  @ApiResponse({ status: 200, description: 'Unsubscribed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async unsubscribe(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.pushService.unsubscribe(user.id, id);
    return { message: 'Push subscription deleted successfully' };
  }

  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List the authenticated user push subscriptions' })
  @ApiResponse({ status: 200, description: 'Subscriptions list', type: [PushSubscriptionResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listSubscriptions(
    @User() user: Express.User & { id: string },
  ): Promise<PushSubscriptionResponseDto[]> {
    const subs = await this.pushService.listSubscriptions(user.id);
    return subs.map((s) => ({
      id: s.id,
      owner_id: s.owner_id,
      endpoint: s.endpoint,
      user_agent: s.user_agent,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));
  }

  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get push notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences', type: [PushPreferenceResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPreferences(
    @User() user: Express.User & { id: string },
  ): Promise<PushPreferenceResponseDto[]> {
    return this.pushService.getPreferences(user.id);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update push notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @Body() dto: UpdatePushPreferencesDto,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.pushService.updatePreferences(user.id, dto.preferences);
    return { message: 'Push preferences updated successfully' };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send a test push notification to the authenticated user devices' })
  @ApiResponse({ status: 200, description: 'Test sent', type: PushTestResultDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async test(
    @User() user: Express.User & { id: string },
  ): Promise<PushTestResultDto> {
    return this.pushService.sendTest(user.id);
  }

  @Post('scheduled')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-cron-secret', description: 'Cron secret for scheduled invocation' })
  @ApiOperation({ summary: 'Run scheduled push checks (cron-secret protected)' })
  @ApiResponse({ status: 200, description: 'Scheduled run result', type: PushSendResultDto })
  @ApiResponse({ status: 401, description: 'Invalid cron secret' })
  async scheduled(
    @Headers('x-cron-secret') cronSecretHeader: string,
  ): Promise<PushSendResultDto> {
    const cronSecret = this.configService.get<string>('push.cronSecret');
    if (!cronSecret || cronSecretHeader !== cronSecret) {
      throw new UnauthorizedException('Invalid cron secret');
    }
    const result = await this.pushService.runScheduled();
    return {
      mode: result.mode,
      candidates: result.candidates,
      claimed: result.claimed,
      sent: result.sent,
    };
  }
}
