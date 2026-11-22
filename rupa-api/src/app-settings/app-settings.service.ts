import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './app-settings.entity.js';
import {
  UpdateAppSettingsDto,
  AppSettingsResponseDto,
} from './dto/app-settings.dto.js';

/** Guard rails for the free-form header map (jsonb column). */
const MAX_HEADERS = 50;
const MAX_HEADER_NAME_LENGTH = 255;
const MAX_HEADER_VALUE_LENGTH = 4096;

/**
 * Per-user AI provider settings.
 *
 * Security notes:
 *  - Every read/write is scoped to `owner_id` taken from the JWT; the DTO
 *    does not accept `owner_id` at all.
 *  - `ai_api_key` is stored exactly as the client sends it (device-bound
 *    ciphertext `enc:v1:…`, or legacy plain text). The server never
 *    decrypts, transforms or logs it — it is treated as opaque text.
 *  - Updates are a single atomic `INSERT … ON CONFLICT (owner_id) DO
 *    UPDATE` (TypeORM `upsert`), so concurrent writers cannot create
 *    duplicate rows for the same user, and only the properties present in
 *    the request body are overwritten (mirroring the Supabase upserts the
 *    client used to make).
 */
@Injectable()
export class AppSettingsService {
  private readonly logger = new Logger(AppSettingsService.name);

  constructor(
    @InjectRepository(AppSetting)
    private readonly settingsRepository: Repository<AppSetting>,
  ) {}

  /**
   * Returns the caller's settings row. When the user has never saved any
   * settings a row-shaped response with every field `null` is returned —
   * every consumer pattern in the client (`data?.x ?? default`, `x?.trim()
   * || null`) treats that identically to Supabase's `maybeSingle()` →
   * `data: null`.
   */
  async getSettings(ownerId: string): Promise<AppSettingsResponseDto> {
    const row = await this.settingsRepository.findOne({
      where: { owner_id: ownerId },
    });
    if (!row) {
      return this.toResponse(null);
    }
    return this.toResponse(row);
  }

  /**
   * Partial upsert of the caller's settings.
   *
   * Only properties present in the DTO are written: omitted properties keep
   * their stored value, an explicit `null` clears the column. Creates the
   * row on first write.
   */
  async updateSettings(
    ownerId: string,
    dto: UpdateAppSettingsDto,
  ): Promise<AppSettingsResponseDto> {
    const headers =
      dto.ai_headers !== undefined
        ? this.normalizeHeaders(dto.ai_headers)
        : undefined;

    const values: Partial<AppSetting> & { owner_id: string } = {
      owner_id: ownerId,
      updated_at: new Date(),
    };
    // Only carry the properties the client actually sent — TypeORM's
    // upsert overwrites a column only when the source object defines it,
    // which is exactly the Supabase `upsert(..., onConflict)` semantics.
    if (dto.ai_api_key !== undefined) values.ai_api_key = dto.ai_api_key;
    if (dto.ai_base_url !== undefined) values.ai_base_url = dto.ai_base_url;
    if (dto.ai_model !== undefined) values.ai_model = dto.ai_model;
    if (headers !== undefined) values.ai_headers = headers;

    await this.settingsRepository.upsert(values, {
      conflictPaths: ['owner_id'],
    });

    const row = await this.settingsRepository.findOne({
      where: { owner_id: ownerId },
    });
    // `upsert` + re-read by owner is atomic at the row level (single
    // statement upsert); a concurrent writer can only ever win the whole
    // row, never interleave a half-updated state.
    return this.toResponse(row);
  }

  /**
   * `ai_headers` must stay a `Record<string, string>` (the column type and
   * the client contract). Rejects arrays and non-string members with 400.
   */
  private normalizeHeaders(
    headers: Record<string, string> | null,
  ): Record<string, string> | null {
    if (headers === null) return null;
    if (typeof headers !== 'object' || Array.isArray(headers)) {
      throw new BadRequestException(
        'ai_headers must be an object of string header values.',
      );
    }
    const entries = Object.entries(headers);
    if (entries.length > MAX_HEADERS) {
      throw new BadRequestException(
        `ai_headers may contain at most ${MAX_HEADERS} entries.`,
      );
    }
    for (const [name, value] of entries) {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          'ai_headers must be an object of string header values.',
        );
      }
      if (name.length === 0 || name.length > MAX_HEADER_NAME_LENGTH) {
        throw new BadRequestException(
          `ai_headers names must be 1-${MAX_HEADER_NAME_LENGTH} characters.`,
        );
      }
      if (value.length > MAX_HEADER_VALUE_LENGTH) {
        throw new BadRequestException(
          `ai_headers values must be at most ${MAX_HEADER_VALUE_LENGTH} characters.`,
        );
      }
    }
    return headers;
  }

  private toResponse(row: AppSetting | null): AppSettingsResponseDto {
    return {
      id: row?.id ?? null,
      owner_id: row?.owner_id ?? null,
      // Opaque ciphertext — returned as stored so the client can decrypt
      // it with its device-bound key.
      ai_api_key: row?.ai_api_key ?? null,
      ai_base_url: row?.ai_base_url ?? null,
      ai_model: row?.ai_model ?? null,
      ai_headers: row?.ai_headers ?? null,
      updated_at: row?.updated_at ?? null,
    };
  }
}
