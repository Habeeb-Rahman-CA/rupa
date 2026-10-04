/**
 * Utility functions for precise floating-point currency comparisons and rounding.
 */

/**
 * Rounds a monetary amount to 2 decimal places reliably.
 */
export function roundCurrency(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Converts a monetary amount into integer cents to prevent floating point inaccuracies.
 */
export function toCents(val: number): number {
  return Math.round(Number(val) * 100);
}

/**
 * Returns true if currency amount `a` is less than or equal to `b` (in cents).
 */
export function isLessOrEqualCurrency(a: number, b: number): boolean {
  return toCents(a) <= toCents(b);
}

/**
 * Returns true if currency amount `a` is strictly greater than `b` (in cents).
 */
export function isGreaterCurrency(a: number, b: number): boolean {
  return toCents(a) > toCents(b);
}

/**
 * Returns true if currency amount `a` is strictly equal to `b` (in cents).
 */
export function isEqualCurrency(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

/**
 * Returns true if currency amount `a` is effectively zero (in cents).
 */
export function isZeroCurrency(a: number): boolean {
  return toCents(a) === 0;
}
