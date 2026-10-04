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
  if (!name) return '#475569';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const palette = [
    '#ef4444', '#f97316', '#f59e0b', '#22c55e',
    '#10b981', '#14b8a6', '#0ea5e9', '#ec4899', '#475569'
  ];
  return palette[Math.abs(hash) % palette.length];
}

export const iconFor = getCategoryIcon;
export const colorFor = getCategoryColor;
export const tileColor = getCategoryColor;
