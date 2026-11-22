import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Category, CategoryKind } from '../src/categories/categories.entity.js';
import { CategoriesService } from '../src/categories/categories.service.js';
import { CreateCategoryDto } from '../src/categories/dto/create-category.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CategoriesService (unit)', () => {
  let service: CategoriesService;
  let repo: Repository<Category>;

  const ownerId = 'owner-1111-1111-1111-111111111111';

  const mockRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: 'CategoryRepository',
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get(CategoriesService);
    repo = module.get('CategoryRepository') as unknown as Repository<Category>;

    // Inject the mock repository via private property for @InjectRepository
    (service as any).categoryRepository = mockRepository;
  });

  describe('list', () => {
    it('returns categories scoped to the owner, ordered by kind then name', async () => {
      const rows = [
        { id: 'c1', owner_id: ownerId, name: 'Food', kind: 'expense' as CategoryKind },
        { id: 'c2', owner_id: ownerId, name: 'Salary', kind: 'income' as CategoryKind },
      ];
      mockRepository.find.mockResolvedValue(rows);

      const result = await service.list(ownerId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
        order: { kind: 'ASC', name: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].owner_id).toBe(ownerId);
    });
  });

  describe('create', () => {
    const dto: CreateCategoryDto = { name: 'Food', kind: 'expense' };

    it('creates a category for the owner', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const created = { id: 'c1', owner_id: ownerId, name: 'Food', kind: 'expense', created_at: new Date() };
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.create(ownerId, dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        owner_id: ownerId,
        name: 'Food',
        kind: 'expense',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(created);
      expect(result.id).toBe('c1');
    });

    it('rejects a duplicate category for the same owner', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'c1', owner_id: ownerId, name: 'Food', kind: 'expense' });

      await expect(service.create(ownerId, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('allows the same name under a different kind', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const created = { id: 'c2', owner_id: ownerId, name: 'Food', kind: 'income', created_at: new Date() };
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      await service.create(ownerId, { ...dto, kind: 'income' });

      expect(mockRepository.create).toHaveBeenCalledWith({
        owner_id: ownerId,
        name: 'Food',
        kind: 'income',
      });
    });
  });

  describe('remove', () => {
    it('deletes an owned category', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'c1', owner_id: ownerId, name: 'Food', kind: 'expense' });
      mockRepository.remove.mockResolvedValue(undefined);

      await service.remove('c1', ownerId);

      expect(mockRepository.remove).toHaveBeenCalledWith({
        id: 'c1',
        owner_id: ownerId,
        name: 'Food',
        kind: 'expense',
      });
    });

    it('throws NotFound when the category does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('c999', ownerId)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });

    it('throws NotFound when the category belongs to another user', async () => {
      mockRepository.findOne.mockResolvedValue(null); // owner-scoped lookup finds nothing

      await expect(service.remove('c1', 'other-owner')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });
  });
});
