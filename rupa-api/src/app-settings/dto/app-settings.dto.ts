import {
  IsOptional,
  IsString,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

function trimOrNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Partial update: **only the properties present in the request body are
 * written** — omitted properties keep their stored value (this mirrors the
 * Supabase `upsert(..., { onConflict: 'owner_id' })` calls the client made,
 * which only carried `ai_api_key`). An explicit `null` clears the column.
 *
 * `owner_id` is deliberately absent: it is always taken from the JWT, so a
 * client cannot set it (unknown properties are rejected by the global
 * whitelist/forbidNonWhitelisted pipe).
 */
export class UpdateAppSettingsDto {
  @ApiPropertyOptional({
    description:
      'AI API key as stored at rest: device ciphertext (enc:v1:…) or legacy plain text. null clears it.',
    example: 'enc:v1:aXZ....',
  })
  @IsOptional()
  @Transform(({ value }) => trimOrNull(value))
  @IsString()
  @MaxLength(8192)
  ai_api_key?: string | null;

  @ApiPropertyOptional({
    description: 'OpenAI-compatible base URL. null clears it (built-in default).',
    example: 'https://api.openai.com/v1',
  })
  @IsOptional()
  @Transform(({ value }) => trimOrNull(value))
  @IsString()
  @MaxLength(2048)
  ai_base_url?: string | null;

  @ApiPropertyOptional({
    description: 'Provider model id. null clears it (built-in default).',
    example: 'gemini-3.8-flash',
  })
  @IsOptional()
  @Transform(({ value }) => trimOrNull(value))
  @IsString()
  @MaxLength(512)
  ai_model?: string | null;

  @ApiPropertyOptional({
    description:
      'Extra request headers (string → string) merged over the defaults. null clears them.',
    example: { 'X-Custom-Header': 'value' },
  })
  @IsOptional()
  @IsObject()
  ai_headers?: Record<string, string> | null;
}

export class AppSettingsResponseDto {
  @ApiPropertyOptional({ nullable: true })
  id: string | null;

  @ApiPropertyOptional({ nullable: true })
  owner_id: string | null;

  @ApiPropertyOptional({
    description: 'Opaque stored key (ciphertext at rest).',
    nullable: true,
  })
  ai_api_key: string | null;

  @ApiPropertyOptional({ nullable: true })
  ai_base_url: string | null;

  @ApiPropertyOptional({ nullable: true })
  ai_model: string | null;

  @ApiPropertyOptional({ nullable: true })
  ai_headers: Record<string, string> | null;

  @ApiPropertyOptional({ nullable: true })
  updated_at: Date | null;
}
