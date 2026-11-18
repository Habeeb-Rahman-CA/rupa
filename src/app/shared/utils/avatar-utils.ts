import { APP_COLORS } from '../../core/theme/colors';

/**
 * Central avatar and string formatting utilities.
 */

/**
 * Generates a deterministic background color based on string input (e.g. person name).
 */
export function getAvatarColor(name: string): string {
  if (!name) return APP_COLORS.inkMuted;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return APP_COLORS.category[Math.abs(hash) % APP_COLORS.category.length];
}

/**
 * Extracts 1 or 2 initial uppercase letters from a name.
 */
export function getInitial(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}
