import {
  daysBetween,
  monthlyEquivalent,
  yearlyEquivalent,
} from './subscriptions.service';

describe('subscription calculations', () => {
  it('normalizes every supported billing cycle to monthly and yearly totals', () => {
    expect(monthlyEquivalent(100, 'weekly')).toBe(433.33);
    expect(monthlyEquivalent(100, 'monthly')).toBe(100);
    expect(monthlyEquivalent(300, 'quarterly')).toBe(100);
    expect(monthlyEquivalent(1200, 'yearly')).toBe(100);

    expect(yearlyEquivalent(100, 'weekly')).toBe(5200);
    expect(yearlyEquivalent(100, 'monthly')).toBe(1200);
    expect(yearlyEquivalent(300, 'quarterly')).toBe(1200);
    expect(yearlyEquivalent(1200, 'yearly')).toBe(1200);
  });

  it('calculates date windows without a timezone shift', () => {
    expect(daysBetween('2026-11-04', '2026-11-04')).toBe(0);
    expect(daysBetween('2026-11-04', '2026-11-05')).toBe(1);
    expect(daysBetween('2026-11-04', '2026-11-11')).toBe(7);
    expect(daysBetween('2026-11-11', '2026-11-04')).toBe(-7);
  });
});
