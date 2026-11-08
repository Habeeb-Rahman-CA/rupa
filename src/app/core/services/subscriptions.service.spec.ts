import {
  daysBetween,
  detectSubscriptionTheme,
  isSubscriptionTheme,
  monthlyEquivalent,
  resolveSubscriptionTheme,
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

  it('correctly detects brand themes based on subscription name and category', () => {
    expect(detectSubscriptionTheme('Claude Pro')).toBe('amber');
    expect(detectSubscriptionTheme('ChatGPT Plus')).toBe('mint');
    expect(detectSubscriptionTheme('Spotify Premium')).toBe('neon');
    expect(detectSubscriptionTheme('Apple Music Individual')).toBe('rose');
    expect(detectSubscriptionTheme('Gold\'s Gym Membership')).toBe('amber');
    expect(detectSubscriptionTheme('Netflix Standard')).toBe('scarlet');
    expect(detectSubscriptionTheme('YouTube Premium')).toBe('scarlet');
    expect(detectSubscriptionTheme('Random Gym Pass', 'Fitness')).toBe('amber');
    expect(detectSubscriptionTheme('Custom Tool', 'Other')).toBe('slate');
  });

  it('resolves valid and fallback themes safely', () => {
    expect(isSubscriptionTheme('copper')).toBeFalse();
    expect(isSubscriptionTheme('mint')).toBeTrue();
    expect(isSubscriptionTheme('unknown')).toBeFalse();

    expect(resolveSubscriptionTheme('neon', 'My Service')).toBe('neon');
    expect(resolveSubscriptionTheme('spotify', 'My Service')).toBe('neon'); // Legacy mapping
    expect(resolveSubscriptionTheme('copper', 'My Service')).toBe('amber'); // Legacy copper fallback
    expect(resolveSubscriptionTheme(null, 'Claude Pro')).toBe('amber');
    expect(resolveSubscriptionTheme(undefined, 'Random Name')).toBe('slate');
  });
});
