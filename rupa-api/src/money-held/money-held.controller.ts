import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';
import { MoneyHeldService } from './money-held.service.js';
import {
  RecordMoneyHeldDto,
  AddMoneyHeldPersonDto,
  MoneyHeldPersonResponse,
  MoneyHeldTransactionResponse,
  MoneyHeldBalanceResponse,
} from './dto/money-held.dto.js';

@ApiTags('money-held')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('money-held')
export class MoneyHeldController {
  constructor(
    @Inject(MoneyHeldService)
    private readonly moneyHeldService: MoneyHeldService,
  ) {}

  @Get('people')
  @ApiOperation({ summary: 'List money-held people for the authenticated user' })
  @ApiResponse({ status: 200, description: 'People list', type: [MoneyHeldPersonResponse] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listPeople(@User() user: Express.User & { id: string }): Promise<MoneyHeldPersonResponse[]> {
    return this.moneyHeldService.listPeople(user.id);
  }

  @Post('people')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({ summary: 'Add a money-held person' })
  @ApiResponse({ status: 201, description: 'Person added', type: MoneyHeldPersonResponse })
  async addPerson(
    @Body() dto: AddMoneyHeldPersonDto,
    @User() user: Express.User & { id: string },
  ): Promise<MoneyHeldPersonResponse> {
    return this.moneyHeldService.addPerson(user.id, dto.person_id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List money-held transactions' })
  @ApiResponse({ status: 200, description: 'Transactions list', type: [MoneyHeldTransactionResponse] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listTransactions(@User() user: Express.User & { id: string }): Promise<MoneyHeldTransactionResponse[]> {
    return this.moneyHeldService.listTransactions(user.id);
  }

  @Get('balances')
  @ApiOperation({ summary: 'List money-held balances per person' })
  @ApiResponse({ status: 200, description: 'Balances', type: [MoneyHeldBalanceResponse] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listBalances(@User() user: Express.User & { id: string }): Promise<MoneyHeldBalanceResponse[]> {
    return this.moneyHeldService.listBalances(user.id);
  }

  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({ summary: 'Record a money-held transaction' })
  @ApiResponse({ status: 201, description: 'Transaction recorded', type: MoneyHeldTransactionResponse })
  async record(
    @Body() dto: RecordMoneyHeldDto,
    @User() user: Express.User & { id: string },
  ): Promise<MoneyHeldTransactionResponse> {
    return this.moneyHeldService.record(user.id, dto);
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a money-held transaction' })
  @ApiResponse({ status: 200, description: 'Transaction deleted' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async delete(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.moneyHeldService.delete(id, user.id);
    return { message: 'Money-held transaction deleted successfully' };
  }
}
