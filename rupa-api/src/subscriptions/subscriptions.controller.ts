import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service.js';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionResponseDto,
  RecordPaymentDto,
  SubscriptionPaymentResponseDto,
  SubscriptionRenewalResponseDto,
  SubscriptionPriceChangeResponseDto,
} from './dto/subscription.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService)
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List subscriptions for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Subscriptions list',
    type: [SubscriptionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<SubscriptionResponseDto[]> {
    return this.subscriptionsService.listSubscriptions(user.id);
  }

  @Get(':id/renewals')
  @ApiOperation({ summary: 'List renewals for a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Renewals, newest first',
    type: [SubscriptionRenewalResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async listRenewals(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionRenewalResponseDto[]> {
    return this.subscriptionsService.listRenewals(id, user.id);
  }

  @Get(':id/price-changes')
  @ApiOperation({ summary: 'List price changes for a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Price changes, newest first',
    type: [SubscriptionPriceChangeResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async listPriceChanges(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionPriceChangeResponseDto[]> {
    return this.subscriptionsService.listPriceChanges(id, user.id);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payments for a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Payments, newest first',
    type: [SubscriptionPaymentResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async listPayments(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionPaymentResponseDto[]> {
    return this.subscriptionsService.listPayments(id, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription' })
  @ApiResponse({ status: 200, description: 'Subscription', type: SubscriptionResponseDto })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async get(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.getSubscription(id, user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a subscription' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateSubscriptionDto,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.createSubscription(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.updateSubscription(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a subscription' })
  @ApiResponse({ status: 200, description: 'Subscription deleted' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.subscriptionsService.deleteSubscription(id, user.id);
    return { message: 'Subscription deleted successfully' };
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a subscription payment' })
  @ApiResponse({
    status: 201,
    description: 'Payment recorded',
    type: SubscriptionPaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @User() user: Express.User & { id: string },
  ): Promise<SubscriptionPaymentResponseDto> {
    return this.subscriptionsService.recordPayment(user.id, id, dto);
  }
}
