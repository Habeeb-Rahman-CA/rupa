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

/**
 * Resolves an AI/speech-suggested category label to the canonical name of one
 * of the user's categories. Matching mirrors the bill scanner's category
 * mapping: an exact case-insensitive comparison first, then a whole-word
 * comparison (with light plural folding) so "food" finds "Food & Dining" and
 * "dining out" finds "Dining", while short keys like "in" never latch onto
 * unrelated names ("Dining"). Returns null when nothing matches.
 */
export function matchCategoryName(
  suggested: string | null | undefined,
  categories: ReadonlyArray<{ name: string }>,
): string | null {
  const name = (suggested ?? '').trim();
  if (!name) return null;
  const key = name.toLowerCase();

  const exact = categories.find((c) => c.name.toLowerCase() === key);
  if (exact) return exact.name;

  const words = (value: string): string[] =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((w) => {
        if (/^[a-z]{6,}ies$/.test(w)) return `${w.slice(0, -3)}y`;
        if (w.length >= 5 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
        return w;
      });

  const said = words(name);
  if (said.length === 0) return null;

  const partial = categories.find((c) => {
    const own = words(c.name);
    if (own.length === 0) return false;
    return own.some((w) => said.includes(w)) || said.some((w) => own.includes(w));
  });
  return partial ? partial.name : null;
}

export function isWalletSpendingCategory(
  category: { name: string } | null | undefined,
): boolean {
  return (
    (category?.name ?? '').trim().toLowerCase() ===
    WALLET_SPENDING_CATEGORY_NAME.toLowerCase()
  );
}
