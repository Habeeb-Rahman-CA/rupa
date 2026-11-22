import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Person } from './person.entity.js';
import { CreatePersonDto } from './dto/person.dto.js';
import { PersonResponseDto } from './dto/person.dto.js';

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
  ) {}

  async listPeople(ownerId: string): Promise<PersonResponseDto[]> {
    const people = await this.personRepository.find({
      where: { owner_id: ownerId },
      order: { name: 'ASC' },
    });
    return people.map((p) => this.toResponse(p));
  }

  async createPerson(
    ownerId: string,
    dto: CreatePersonDto,
  ): Promise<PersonResponseDto> {
    const person = this.personRepository.create({
      owner_id: ownerId,
      name: dto.name.trim(),
      phone: dto.phone ? dto.phone.trim() : null,
      notes: dto.notes ? dto.notes.trim() : null,
    });
    const saved = await this.personRepository.save(person);
    return this.toResponse(saved);
  }

  async updatePerson(
    id: string,
    ownerId: string,
    dto: CreatePersonDto,
  ): Promise<PersonResponseDto> {
    const person = await this.personRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    person.name = dto.name.trim();
    person.phone = dto.phone ? dto.phone.trim() : null;
    person.notes = dto.notes ? dto.notes.trim() : null;
    const saved = await this.personRepository.save(person);
    return this.toResponse(saved);
  }

  async deletePerson(id: string, ownerId: string): Promise<void> {
    const person = await this.personRepository.findOne({
      where: { id, owner_id: ownerId },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    await this.personRepository.remove(person);
  }

  private toResponse(p: Person): PersonResponseDto {
    return {
      id: p.id,
      owner_id: p.owner_id,
      name: p.name,
      phone: p.phone,
      notes: p.notes,
      created_at: p.created_at,
    };
  }
}
