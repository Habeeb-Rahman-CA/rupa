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
import { TransfersService } from './transfers.service.js';
import {
  CreateAccountTransferDto,
  UpdateAccountTransferDto,
  AccountTransferResponseDto,
} from './dto/transfer.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(
    @Inject(TransfersService)
    private readonly transfersService: TransfersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List account transfers for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Transfers list',
    type: [AccountTransferResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<AccountTransferResponseDto[]> {
    return this.transfersService.listTransfers(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account transfer' })
  @ApiResponse({
    status: 201,
    description: 'Transfer created',
    type: AccountTransferResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateAccountTransferDto,
    @User() user: Express.User & { id: string },
  ): Promise<AccountTransferResponseDto> {
    return this.transfersService.createTransfer(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an account transfer' })
  @ApiResponse({
    status: 200,
    description: 'Transfer updated',
    type: AccountTransferResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountTransferDto,
    @User() user: Express.User & { id: string },
  ): Promise<AccountTransferResponseDto> {
    return this.transfersService.updateTransfer(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an account transfer' })
  @ApiResponse({ status: 200, description: 'Transfer deleted' })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.transfersService.deleteTransfer(id, user.id);
    return { message: 'Transfer deleted successfully' };
  }
}
