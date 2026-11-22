import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppSetting } from '../src/app-settings/app-settings.entity.js';
import { AppSettingsService } from '../src/app-settings/app-settings.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AppSettingsService (unit)', () => {
  let service: AppSettingsService;
  let repo: any;

  const ownerId = '22222222-2222-4222-8222-222222222222';

  const storedRow = (over: Partial<AppSetting> = {}): AppSetting =>
    ({
      id: 'as-1',
      owner_id: ownerId,
      ai_api_key: 'enc:v1:abc:def',
      ai_base_url: 'https://api.openai.com/v1',
      ai_model: 'gpt-5',
      ai_headers: { 'X-Team': 'beta' },
      updated_at: new Date('2026-01-01'),
      ...over,
    }) as AppSetting;

  beforeEach(async () => {
    vi.clearAllMocks();
    repo = {
      findOne: vi.fn(),
      upsert: vi.fn(async () => ({ identifiers: [], raw: [] })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppSettingsService,
        { provide: getRepositoryToken(AppSetting), useValue: repo },
      ],
    }).compile();

    service = module.get(AppSettingsService);
  });

  describe('getSettings', () => {
    it('returns the stored row for the owner', async () => {
      repo.findOne.mockResolvedValue(storedRow());
      const result = await service.getSettings(ownerId);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
      });
      expect(result.id).toBe('as-1');
      expect(result.ai_api_key).toBe('enc:v1:abc:def');
      expect(result.ai_base_url).toBe('https://api.openai.com/v1');
      expect(result.ai_model).toBe('gpt-5');
      expect(result.ai_headers).toEqual({ 'X-Team': 'beta' });
    });

    it('returns an all-null shape when the user has no row', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.getSettings(ownerId);
      expect(result).toEqual({
        id: null,
        owner_id: null,
        ai_api_key: null,
        ai_base_url: null,
        ai_model: null,
        ai_headers: null,
        updated_at: null,
      });
    });
  });

  describe('updateSettings', () => {
    it('upserts scoped to the JWT owner_id (never a client-supplied one)', async () => {
      repo.findOne.mockResolvedValue(storedRow());
      await service.updateSettings(ownerId, { ai_model: 'claude-4' });

      expect(repo.upsert).toHaveBeenCalledTimes(1);
      const [values, options] = repo.upsert.mock.calls[0];
      expect(values.owner_id).toBe(ownerId);
      expect(options).toEqual({ conflictPaths: ['owner_id'] });
      expect(values.ai_model).toBe('claude-4');
      expect(values.updated_at).toBeInstanceOf(Date);
    });

    it('only writes the properties present in the DTO (partial update)', async () => {
      repo.findOne.mockResolvedValue(storedRow());
      await service.updateSettings(ownerId, { ai_model: 'gemini-3.8-flash' });

      const [values] = repo.upsert.mock.calls[0];
      expect(values).toHaveProperty('ai_model');
      expect(values).not.toHaveProperty('ai_api_key');
      expect(values).not.toHaveProperty('ai_base_url');
      expect(values).not.toHaveProperty('ai_headers');
    });

    it('writes an explicit null to clear a column', async () => {
      repo.findOne.mockResolvedValue(storedRow());
      await service.updateSettings(ownerId, { ai_api_key: null });

      const [values] = repo.upsert.mock.calls[0];
      expect(values).toHaveProperty('ai_api_key');
      expect(values.ai_api_key).toBeNull();
    });

    it('passes a valid header map through unchanged', async () => {
      repo.findOne.mockResolvedValue(storedRow());
      const headers = { 'X-A': '1', 'X-B': '2' };
      await service.updateSettings(ownerId, { ai_headers: headers });

      const [values] = repo.upsert.mock.calls[0];
      expect(values.ai_headers).toEqual(headers);
    });

    it('rejects a header map with non-string values', async () => {
      await expect(
        service.updateSettings(ownerId, {
          ai_headers: { 'X-A': 1 as unknown as string },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects an array instead of a header object', async () => {
      await expect(
        service.updateSettings(ownerId, {
          ai_headers: ['X-A: 1'] as unknown as Record<string, string>,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects too many headers', async () => {
      const many: Record<string, string> = {};
      for (let i = 0; i < 51; i += 1) many[`X-${i}`] = 'v';
      await expect(
        service.updateSettings(ownerId, { ai_headers: many }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('returns the persisted row after the upsert', async () => {
      repo.findOne.mockResolvedValue(storedRow({ ai_model: 'gpt-5-mini' }));
      const result = await service.updateSettings(ownerId, { ai_model: 'gpt-5-mini' });
      expect(result.ai_model).toBe('gpt-5-mini');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { owner_id: ownerId },
      });
    });
  });
});
