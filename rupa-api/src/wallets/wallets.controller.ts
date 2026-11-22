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
import { WalletsService } from './wallets.service.js';
import {
  CreateWalletDto,
  UpdateWalletDto,
  WalletResponseDto,
  CreateWalletTransactionDto,
  WalletTransactionResponseDto,
} from './dto/wallet.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    @Inject(WalletsService)
    private readonly walletsService: WalletsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List wallets for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Wallets list', type: [WalletResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<WalletResponseDto[]> {
    return this.walletsService.listWallets(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a wallet' })
  @ApiResponse({ status: 201, description: 'Wallet created', type: WalletResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateWalletDto,
    @User() user: Express.User & { id: string },
  ): Promise<WalletResponseDto> {
    return this.walletsService.createWallet(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a wallet' })
  @ApiResponse({ status: 200, description: 'Wallet updated', type: WalletResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
    @User() user: Express.User & { id: string },
  ): Promise<WalletResponseDto> {
    return this.walletsService.updateWallet(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a wallet' })
  @ApiResponse({ status: 200, description: 'Wallet deleted' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.walletsService.deleteWallet(id, user.id);
    return { message: 'Wallet deleted successfully' };
  }

  @Get(':walletId/transactions')
  @ApiOperation({ summary: 'List wallet transactions' })
  @ApiResponse({
    status: 200,
    description: 'Wallet transactions list',
    type: [WalletTransactionResponseDto],
  })
  async listWalletTransactions(
    @Param('walletId') walletId: string,
    @User() user: Express.User & { id: string },
  ): Promise<WalletTransactionResponseDto[]> {
    return this.walletsService.listWalletTransactions(user.id, walletId);
  }

  @Post(':walletId/transactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a wallet transaction (recharge/spend)' })
  @ApiResponse({
    status: 201,
    description: 'Wallet transaction created',
    type: WalletTransactionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createWalletTransaction(
    @Param('walletId') walletId: string,
    @Body() dto: CreateWalletTransactionDto,
    @User() user: Express.User & { id: string },
  ): Promise<WalletTransactionResponseDto> {
    return this.walletsService.createWalletTransaction(user.id, walletId, dto);
  }

  @Patch('transactions/:id')
  @ApiOperation({ summary: 'Update a wallet transaction' })
  @ApiResponse({
    status: 200,
    description: 'Wallet transaction updated',
    type: WalletTransactionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Wallet transaction not found' })
  async updateWalletTransaction(
    @Param('id') id: string,
    @Body() dto: CreateWalletTransactionDto,
    @User() user: Express.User & { id: string },
  ): Promise<WalletTransactionResponseDto> {
    return this.walletsService.updateWalletTransaction(user.id, id, dto);
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a wallet transaction' })
  @ApiResponse({ status: 200, description: 'Wallet transaction deleted' })
  @ApiResponse({ status: 404, description: 'Wallet transaction not found' })
  async deleteWalletTransaction(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.walletsService.deleteWalletTransaction(user.id, id);
    return { message: 'Wallet transaction deleted successfully' };
  }
}
