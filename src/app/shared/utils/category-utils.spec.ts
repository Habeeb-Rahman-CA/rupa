import { matchCategoryName } from './category-utils';

describe('matchCategoryName', () => {
  const categories = [
    { name: 'Food & Dining' },
    { name: 'Groceries' },
    { name: 'Dining' },
  ];

  it('matches exactly, ignoring case', () => {
    expect(matchCategoryName('groceries', categories)).toBe('Groceries');
    expect(matchCategoryName('  FOOD & DINING ', categories)).toBe('Food & Dining');
  });

  it('matches on a whole word when wording differs', () => {
    expect(matchCategoryName('food', categories)).toBe('Food & Dining');
    expect(matchCategoryName('dining out', categories)).toBe('Food & Dining');
  });

  it('folds simple plurals', () => {
    expect(matchCategoryName('bills', [{ name: 'Bill' }])).toBe('Bill');
    expect(matchCategoryName('grocery', [{ name: 'Groceries' }])).toBe('Groceries');
  });

  it('does not latch short fragments onto longer names', () => {
    expect(matchCategoryName('in', categories)).toBeNull();
    expect(matchCategoryName('cash', [{ name: 'Cashback' }])).toBeNull();
  });

  it('returns null for empty or unmatched suggestions', () => {
    expect(matchCategoryName('', categories)).toBeNull();
    expect(matchCategoryName(null, categories)).toBeNull();
    expect(matchCategoryName('Pet Supplies', categories)).toBeNull();
  });
});
