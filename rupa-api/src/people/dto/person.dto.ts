import {
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePersonDto {
  @ApiProperty({ example: 'Ravi Sharma' })
  @IsNotEmpty()
  @Transform(({ value }) => trimValue(value))
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Friend from college' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @MaxLength(1000)
  notes?: string | null;
}

export class PersonResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() owner_id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() phone: string | null;
  @ApiPropertyOptional() notes: string | null;
  @ApiProperty() created_at: Date;
}
