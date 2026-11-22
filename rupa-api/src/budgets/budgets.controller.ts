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
import { BudgetsService } from './budgets.service.js';
import {
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetResponseDto,
} from './dto/budget.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(
    @Inject(BudgetsService)
    private readonly budgetsService: BudgetsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List budgets with spending status' })
  @ApiResponse({ status: 200, description: 'Budgets list', type: [BudgetResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<BudgetResponseDto[]> {
    return this.budgetsService.listBudgets(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a budget with spending status' })
  @ApiResponse({ status: 200, description: 'Budget', type: BudgetResponseDto })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async get(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.getBudget(id, user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a budget' })
  @ApiResponse({ status: 201, description: 'Budget created', type: BudgetResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateBudgetDto,
    @User() user: Express.User & { id: string },
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.createBudget(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a budget' })
  @ApiResponse({ status: 200, description: 'Budget updated', type: BudgetResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @User() user: Express.User & { id: string },
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.updateBudget(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a budget' })
  @ApiResponse({ status: 200, description: 'Budget deleted' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.budgetsService.deleteBudget(id, user.id);
    return { message: 'Budget deleted successfully' };
  }
}
