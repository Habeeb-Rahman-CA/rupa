import { shuffleDigits } from './random-utils';

describe('shuffleDigits', () => {
  it('returns a permutation of 0–9 — every digit exactly once', () => {
    for (let run = 0; run < 50; run++) {
      const result = shuffleDigits();

      expect(result.length).toBe(10);
      expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('randomizes the order across calls', () => {
    const seen = new Set<string>();
    for (let run = 0; run < 20; run++) {
      seen.add(shuffleDigits().join(','));
    }
    // Two identical shuffles out of 20 draws is astronomically unlikely
    // unless the shuffle is not actually random.
    expect(seen.size).toBeGreaterThan(1);
  });
});
