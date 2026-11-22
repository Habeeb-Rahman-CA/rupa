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
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { CategoryResponseDto } from './dto/create-category.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CategoriesService)
    private readonly categoriesService: CategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all categories for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Categories list', type: [CategoryResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@User() user: Express.User & { id: string }): Promise<CategoryResponseDto[]> {
    return this.categoriesService.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      expectedType: CreateCategoryDto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created', type: CategoryResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Category already exists' })
  async create(
    @Body() dto: CreateCategoryDto,
    @User() user: Express.User & { id: string },
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a category by id' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(
    @Param('id') id: string,
    @User() user: Express.User & { id: string },
  ): Promise<{ message: string }> {
    await this.categoriesService.remove(id, user.id);
    return { message: 'Category deleted successfully' };
  }
}
