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
import { DebtsService } from './debts.service.js';
import {
  CreateDebtDto,
  AddPaymentDto,
  DebtResponseDto,
  DebtPaymentResponseDto,
} from './dto/debt.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('debts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(
    @Inject(DebtsService)
    private readonly debtsService: DebtsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List debts for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Debts list', type: [DebtResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<DebtResponseDto[]> {
    return this.debtsService.listDebts(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a debt (with linked transaction)' })
  @ApiResponse({ status: 201, description: 'Debt created', type: DebtResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateDebtDto,
    @User() user: Express.User & { id: string },
  ): Promise<DebtResponseDto> {
    return this.debtsService.createDebt(user.id, dto);
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a payment against a debt' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Debt not found' })
  async addPayment(
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.debtsService.addPayment(user.id, id, dto);
    return { message: 'Payment recorded successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a debt and its linked transactions' })
  @ApiResponse({ status: 200, description: 'Debt deleted' })
  @ApiResponse({ status: 404, description: 'Debt not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.debtsService.deleteDebt(id, user.id);
    return { message: 'Debt deleted successfully' };
  }
}
