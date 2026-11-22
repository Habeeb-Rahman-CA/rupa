import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, CategoryKind } from './categories.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { CategoryResponseDto } from './dto/create-category.dto.js';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async list(ownerId: string): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      where: { owner_id: ownerId },
      order: { kind: 'ASC', name: 'ASC' },
    });
    return categories.map((c) => this.toResponse(c));
  }

  async create(
    ownerId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepository.findOne({
      where: { owner_id: ownerId, name: dto.name, kind: dto.kind },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    const category = this.categoryRepository.create({
      owner_id: ownerId,
      name: dto.name,
      kind: dto.kind as CategoryKind,
    });
    const saved = await this.categoryRepository.save(category);
    return this.toResponse(saved);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    await this.categoryRepository.remove(category);
  }

  private toResponse(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      owner_id: category.owner_id,
      name: category.name,
      kind: category.kind,
      created_at: category.created_at,
    };
  }
}
