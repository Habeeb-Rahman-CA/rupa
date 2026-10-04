/**
 * Central avatar and string formatting utilities.
 */

/**
 * Generates a deterministic background color based on string input (e.g. person name).
 */
export function getAvatarColor(name: string): string {
  if (!name) return '#6b7280';
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
