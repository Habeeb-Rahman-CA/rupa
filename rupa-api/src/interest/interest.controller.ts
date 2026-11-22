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
import { InterestService } from './interest.service.js';
import {
  CreateInterestEntryDto,
  InterestEntryResponseDto,
  CreateInterestDisposalDto,
  InterestDisposalResponseDto,
  UpdateInterestEntryStageDto,
  InterestSummaryDto,
} from './dto/interest.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('interest')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interest')
export class InterestController {
  constructor(
    @Inject(InterestService)
    private readonly interestService: InterestService,
  ) {}

  @Get('entries')
  @ApiOperation({ summary: 'List interest entries for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Entries list', type: [InterestEntryResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listEntries(
    @User() user: Express.User & { id: string },
  ): Promise<InterestEntryResponseDto[]> {
    return this.interestService.listEntries(user.id);
  }

  @Post('entries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an interest credit' })
  @ApiResponse({ status: 201, description: 'Entry created', type: InterestEntryResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate interest entry' })
  async createEntry(
    @Body() dto: CreateInterestEntryDto,
    @User() user: Express.User & { id: string },
  ): Promise<InterestEntryResponseDto> {
    return this.interestService.createEntry(user.id, dto);
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Update an interest entry stage' })
  @ApiResponse({ status: 200, description: 'Entry updated', type: InterestEntryResponseDto })
  @ApiResponse({ status: 404, description: 'Interest entry not found' })
  async updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateInterestEntryStageDto,
    @User() user: Express.User & { id: string },
  ): Promise<InterestEntryResponseDto> {
    return this.interestService.updateEntryStage(id, user.id, dto.stage);
  }

  @Delete('entries/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an interest entry and its disposals' })
  @ApiResponse({ status: 200, description: 'Entry deleted' })
  @ApiResponse({ status: 404, description: 'Interest entry not found' })
  async deleteEntry(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.interestService.deleteEntry(id, user.id);
    return { message: 'Interest entry deleted successfully' };
  }

  @Get('disposals')
  @ApiOperation({ summary: 'List interest disposals for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Disposals list', type: [InterestDisposalResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listDisposals(
    @User() user: Express.User & { id: string },
  ): Promise<InterestDisposalResponseDto[]> {
    return this.interestService.listDisposals(user.id);
  }

  @Post('disposals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a disposal, allocated FIFO across entries' })
  @ApiResponse({ status: 201, description: 'Disposal rows created', type: [InterestDisposalResponseDto] })
  @ApiResponse({ status: 400, description: 'Amount exceeds the pending balance' })
  async recordDisposal(
    @Body() dto: CreateInterestDisposalDto,
    @User() user: Express.User & { id: string },
  ): Promise<InterestDisposalResponseDto[]> {
    return this.interestService.recordDisposal(user.id, dto);
  }

  @Delete('disposals/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a disposal and re-open its entry' })
  @ApiResponse({ status: 200, description: 'Disposal deleted' })
  @ApiResponse({ status: 404, description: 'Interest disposal not found' })
  async deleteDisposal(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.interestService.deleteDisposal(id, user.id);
    return { message: 'Interest disposal deleted successfully' };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totals: received, disposed and pending balance' })
  @ApiResponse({ status: 200, description: 'Summary', type: InterestSummaryDto })
  async summary(
    @User() user: Express.User & { id: string },
  ): Promise<InterestSummaryDto> {
    return this.interestService.summary(user.id);
  }
}
