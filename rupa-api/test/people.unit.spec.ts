import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Person } from '../src/people/person.entity.js';
import { PeopleService } from '../src/people/people.service.js';
import { CreatePersonDto } from '../src/people/dto/person.dto.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PeopleService (unit)', () => {
  let service: PeopleService;
  let repo: any;

  const ownerId = 'owner-6666-6666-6666-666666666666';

  beforeEach(async () => {
    vi.clearAllMocks();
    repo = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeopleService,
        { provide: 'PersonRepository', useValue: repo },
      ],
    }).compile();

    service = module.get(PeopleService);
    (service as any).personRepository = repo;
  });

  const basePerson: Person = {
    id: 'p-1',
    owner_id: ownerId,
    name: 'Ravi',
    phone: '+91 99999 99999',
    notes: 'Friend',
    created_at: new Date(),
  };

  describe('listPeople', () => {
    it('returns owner people ordered by name asc', async () => {
      repo.find.mockResolvedValue([basePerson]);
      const result = await service.listPeople(ownerId);
      expect(repo.find).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
        order: { name: 'ASC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ravi');
    });
  });

  describe('createPerson', () => {
    it('creates a person with trimmed name', async () => {
      const created = { ...basePerson, id: 'p-2', name: 'Ravi Sharma' };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.createPerson(ownerId, {
        name: '  Ravi Sharma  ',
      } as CreatePersonDto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ravi Sharma' }),
      );
      expect(result.name).toBe('Ravi Sharma');
    });
  });

  describe('updatePerson', () => {
    it('updates an owned person', async () => {
      const updated = { ...basePerson, name: 'Ravi S.' };
      repo.findOne.mockResolvedValue(basePerson);
      repo.save.mockResolvedValue(updated);

      const result = await service.updatePerson('p-1', ownerId, {
        name: 'Ravi S.',
      } as CreatePersonDto);

      expect(result.name).toBe('Ravi S.');
    });

    it('throws NotFound for another user person', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.updatePerson('p-1', 'other-owner', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deletePerson', () => {
    it('deletes an owned person', async () => {
      repo.findOne.mockResolvedValue(basePerson);
      repo.remove.mockResolvedValue(undefined);
      await service.deletePerson('p-1', ownerId);
      expect(repo.remove).toHaveBeenCalledWith(basePerson);
    });

    it('throws NotFound when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.deletePerson('p-9', ownerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
