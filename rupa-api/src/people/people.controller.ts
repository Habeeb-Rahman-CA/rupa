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
import { PeopleService } from './people.service.js';
import { CreatePersonDto } from './dto/person.dto.js';
import { PersonResponseDto } from './dto/person.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('people')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('people')
export class PeopleController {
  constructor(
    @Inject(PeopleService)
    private readonly peopleService: PeopleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List people for the authenticated user' })
  @ApiResponse({ status: 200, description: 'People list', type: [PersonResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<PersonResponseDto[]> {
    return this.peopleService.listPeople(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a person' })
  @ApiResponse({ status: 201, description: 'Person created', type: PersonResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() dto: CreatePersonDto,
    @User() user: Express.User & { id: string },
  ): Promise<PersonResponseDto> {
    return this.peopleService.createPerson(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a person' })
  @ApiResponse({ status: 200, description: 'Person updated', type: PersonResponseDto })
  @ApiResponse({ status: 404, description: 'Person not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: CreatePersonDto,
    @User() user: Express.User & { id: string },
  ): Promise<PersonResponseDto> {
    return this.peopleService.updatePerson(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a person' })
  @ApiResponse({ status: 200, description: 'Person deleted' })
  @ApiResponse({ status: 404, description: 'Person not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.peopleService.deletePerson(id, user.id);
    return { message: 'Person deleted successfully' };
  }
}
