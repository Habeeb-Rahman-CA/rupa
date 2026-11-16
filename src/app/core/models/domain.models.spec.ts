import { isSavingsCategory, markAsSavingsCategory } from './domain.models';

describe('domain.models (user-scoped savings keys)', () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
    spyOn(localStorage, 'getItem').and.callFake((key: string) => storage[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      storage[key] = value;
    });
  });

  const cat = (id: string, kind: 'income' | 'expense' | 'savings', name: string) => ({
    id,
    owner_id: 'u',
    name,
    kind,
    created_at: '2026-01-01T00:00:00.000Z',
  });

  describe('markAsSavingsCategory / isSavingsCategory', () => {
    it('scopes savings flags by user id', () => {
      markAsSavingsCategory('cat-a', 'user-1');
      markAsSavingsCategory('cat-b', 'user-2');

      expect(isSavingsCategory(cat('cat-a', 'expense', 'x'), 'user-1')).toBeTrue();
      expect(isSavingsCategory(cat('cat-a', 'expense', 'x'), 'user-2')).toBeFalse();
      expect(isSavingsCategory(cat('cat-b', 'expense', 'x'), 'user-2')).toBeTrue();
      expect(isSavingsCategory(cat('cat-b', 'expense', 'x'), 'user-1')).toBeFalse();
    });

    it('treats savings kind as savings regardless of user', () => {
      const c = cat('cat-c', 'savings', 'Savings');
      expect(isSavingsCategory(c)).toBeTrue();
      expect(isSavingsCategory(c, 'user-1')).toBeTrue();
    });

    it('falls back to name-based detection when no storage flag exists', () => {
      const c = cat('cat-d', 'expense', 'Emergency Fund');
      expect(isSavingsCategory(c, 'user-1')).toBeTrue();
    });
  });
});
