/**
 * Safely parses an ISO date string ('YYYY-MM-DD') into a local Date object.
 * Prevents UTC midnight string parsing from shifting dates into adjacent days
 * near UTC/local timezone boundaries.
 */
export function parseIsoDateLocal(isoDate: string): Date {
  if (!isoDate) return new Date();
  const parts = isoDate.split('-');
  if (parts.length < 3) return new Date(isoDate);
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return new Date(isoDate);
  return new Date(y, m - 1, d);
}

/**
 * Calculates DST-safe difference in whole days between two dates.
 * Math.round avoids off-by-one errors caused by 23-hour or 25-hour daylight saving days.
 */
export function daysBetween(d1: Date, d2: Date): number {
  const diffMs = d1.getTime() - d2.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
