import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { describe, it, expect } from 'vitest';

/**
 * Integration test: the real AppModule graph must be resolvable.
 * Catches missing `TypeOrmModule.forFeature` entries and missing cross-module
 * imports that unit/e2e tests (which hand-assemble their own testing modules)
 * can never see.
 */
describe('AppModule (integration)', () => {
  it('compiles and resolves every provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60000);
});
