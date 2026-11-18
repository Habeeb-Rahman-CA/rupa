import { APP_COLORS } from '../../core/theme/colors';

/**
 * Central category visualization utilities.
 */

/**
 * Maps category names to representative Lucide icons.
 */
export function getCategoryIcon(name: string): string {
  const key = (name || '').toLowerCase();
  if (key.includes('food') || key.includes('groc')) return 'utensils-crossed';
  if (key.includes('fuel') || key.includes('petrol') || key.includes('transport')) return 'fuel';
  if (key.includes('rent') || key.includes('home')) return 'home';
  if (key.includes('salary')) return 'briefcase';
  if (key.includes('pf') || key.includes('invest') || key.includes('savin') || key.includes('fund') || key.includes('gold')) return 'piggy-bank';
  if (key.includes('bill') || key.includes('util')) return 'receipt';
  if (key.includes('shop')) return 'shopping-bag';
  if (key.includes('travel') || key.includes('trip')) return 'plane';
  if (key.includes('health') || key.includes('med')) return 'stethoscope';
  if (key.includes('income')) return 'trending-up';
  return 'wallet';
}

/**
 * Generates a deterministic palette color for categories.
 */
export function getCategoryColor(name: string): string {
  if (!name) return APP_COLORS.category[8];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return APP_COLORS.category[Math.abs(hash) % APP_COLORS.category.length];
}

export const iconFor = getCategoryIcon;
export const colorFor = getCategoryColor;
export const tileColor = getCategoryColor;

/**
 * Name of the system category that wallet spending is recorded under.
 * The wallet spend sheet shows it as pre-selected, so the service resolves
 * (and creates on first use) its real id before saving.
 */
export const WALLET_SPENDING_CATEGORY_NAME = 'Wallet spending';

export function isWalletSpendingCategory(
  category: { name: string } | null | undefined,
): boolean {
  return (
    (category?.name ?? '').trim().toLowerCase() ===
    WALLET_SPENDING_CATEGORY_NAME.toLowerCase()
  );
}
