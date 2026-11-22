import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/transaction.dto.js';
import { TransactionResponseDto } from './dto/transaction.dto.js';
import { OpeningBalanceDto } from './dto/transaction.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    @Inject(TransactionsService)
    private readonly transactionsService: TransactionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List transactions for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Transactions list', type: [TransactionResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(
    @User() user: Express.User & { id: string },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TransactionResponseDto[]> {
    return this.transactionsService.list(user.id, limit ? Number(limit) : 50, cursor);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Transaction aggregates (income/expense/savings/balance)' })
  @ApiResponse({ status: 200, description: 'Aggregates' })
  async stats(@User() user: Express.User & { id: string }) {
    return this.transactionsService.stats(user.id);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Current net balance (in minus out)' })
  @ApiResponse({ status: 200, description: 'Balance', type: OpeningBalanceDto })
  async balance(@User() user: Express.User & { id: string }): Promise<OpeningBalanceDto> {
    return this.transactionsService.balance(user.id);
  }

  @Get('opening-balance')
  @ApiOperation({ summary: 'Opening balance' })
  @ApiResponse({ status: 200, description: 'Opening balance', type: OpeningBalanceDto })
  async openingBalance(
    @User() user: Express.User & { id: string },
  ): Promise<OpeningBalanceDto> {
    return this.transactionsService.openingBalance(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a transaction (with bank balance side effect)' })
  @ApiResponse({ status: 201, description: 'Transaction created', type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateTransactionDto,
    @User() user: Express.User & { id: string },
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a transaction (with bank balance revert)' })
  @ApiResponse({ status: 200, description: 'Transaction deleted' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.transactionsService.delete(id, user.id);
    return { message: 'Transaction deleted successfully' };
  }

  @Post('opening-balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the opening balance' })
  @ApiResponse({ status: 200, description: 'Opening balance set', type: TransactionResponseDto })
  async setOpeningBalance(
    @Body() dto: { amount: number; occurred_on?: string },
    @User() user: Express.User & { id: string },
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.setOpeningBalance(user.id, dto.amount, dto.occurred_on);
  }

  @Patch(':id/categorize')
  @ApiOperation({ summary: 'Set a transaction category' })
  @ApiResponse({ status: 200, description: 'Transaction categorized', type: TransactionResponseDto })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async categorize(
    @Param('id') id: string,
    @Body() dto: { category_id: string | null },
    @User() user: Express.User & { id: string },
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.categorize(id, user.id, dto.category_id);
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign unassigned bank transactions to an account' })
  @ApiResponse({ status: 200, description: 'Transactions assigned' })
  async assign(
    @Body() dto: { account_id: string; transaction_ids: string[] },
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.transactionsService.assignToAccount(
      user.id,
      dto.account_id,
      dto.transaction_ids,
    );
    return { message: 'Transactions assigned successfully' };
  }
}
