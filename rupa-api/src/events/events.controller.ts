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
import { EventsService } from './events.service.js';
import {
  CreateEventDto,
  EventResponseDto,
  AddParticipantDto,
  EventParticipantResponseDto,
  AddExpenseDto,
  EventExpenseResponseDto,
  RecordSettlementDto,
  EventSettlementResponseDto,
} from './dto/event.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(
    @Inject(EventsService)
    private readonly eventsService: EventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List events for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Events list', type: [EventResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(
    @User() user: Express.User & { id: string },
  ): Promise<EventResponseDto[]> {
    return this.eventsService.listEvents(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an event with participants, expenses and settlements' })
  @ApiResponse({ status: 200, description: 'Event', type: EventResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async get(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<EventResponseDto> {
    return this.eventsService.getEvent(id, user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an event' })
  @ApiResponse({ status: 201, description: 'Event created', type: EventResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreateEventDto,
    @User() user: Express.User & { id: string },
  ): Promise<EventResponseDto> {
    return this.eventsService.createEvent(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event' })
  @ApiResponse({ status: 200, description: 'Event updated', type: EventResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateEventDto,
    @User() user: Express.User & { id: string },
  ): Promise<EventResponseDto> {
    return this.eventsService.updateEvent(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an event' })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.eventsService.deleteEvent(id, user.id);
    return { message: 'Event deleted successfully' };
  }

  @Post(':id/participants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a participant to an event' })
  @ApiResponse({ status: 201, description: 'Participant added', type: EventParticipantResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async addParticipant(
    @Param('id') id: string,
    @Body() dto: AddParticipantDto,
    @User() user: Express.User & { id: string },
  ): Promise<EventParticipantResponseDto> {
    return this.eventsService.addParticipant(id, user.id, dto);
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'List event participants' })
  @ApiResponse({ status: 200, description: 'Participants list', type: [EventParticipantResponseDto] })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async listParticipants(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<EventParticipantResponseDto[]> {
    return this.eventsService.listParticipants(id, user.id);
  }

  @Post(':id/expenses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an event expense and split it across participants' })
  @ApiResponse({ status: 201, description: 'Expense recorded', type: EventExpenseResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async addExpense(
    @Param('id') id: string,
    @Body() dto: AddExpenseDto,
    @User() user: Express.User & { id: string },
  ): Promise<EventExpenseResponseDto> {
    return this.eventsService.addExpense(id, user.id, dto);
  }

  @Get(':id/expenses')
  @ApiOperation({ summary: 'List event expenses' })
  @ApiResponse({ status: 200, description: 'Expenses list', type: [EventExpenseResponseDto] })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async listExpenses(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<EventExpenseResponseDto[]> {
    return this.eventsService.listExpenses(id, user.id);
  }

  @Post(':id/settlements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a settlement between participants' })
  @ApiResponse({ status: 201, description: 'Settlement recorded', type: EventSettlementResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async recordSettlement(
    @Param('id') id: string,
    @Body() dto: RecordSettlementDto,
    @User() user: Express.User & { id: string },
  ): Promise<EventSettlementResponseDto> {
    return this.eventsService.recordSettlement(id, user.id, dto);
  }

  @Get(':id/settlements')
  @ApiOperation({ summary: 'List event settlements' })
  @ApiResponse({ status: 200, description: 'Settlements list', type: [EventSettlementResponseDto] })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async listSettlements(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<EventSettlementResponseDto[]> {
    return this.eventsService.listSettlements(id, user.id);
  }
}
