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
import { BankAccountsService } from './bank-accounts.service.js';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  BankAccountResponseDto,
  SetPrimaryResponseDto,
} from './dto/bank-account.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(
    @Inject(BankAccountsService)
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bank accounts for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Bank accounts list', type: [BankAccountResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<BankAccountResponseDto[]> {
    return this.bankAccountsService.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a bank account' })
  @ApiResponse({ status: 201, description: 'Bank account created', type: BankAccountResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateBankAccountDto,
    @User() user: Express.User & { id: string },
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a bank account' })
  @ApiResponse({ status: 200, description: 'Bank account updated', type: BankAccountResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  async update(
    @Body() dto: UpdateBankAccountDto,
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a bank account' })
  @ApiResponse({ status: 200, description: 'Bank account deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.bankAccountsService.remove(id, user.id);
    return { message: 'Bank account deleted successfully' };
  }

  @Post(':id/set-primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a bank account as primary' })
  @ApiResponse({ status: 200, description: 'Primary account updated', type: SetPrimaryResponseDto })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  async setPrimary(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<SetPrimaryResponseDto> {
    return this.bankAccountsService.setPrimary(id, user.id);
  }
}
