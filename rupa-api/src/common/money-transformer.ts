import { ValueTransformer } from 'typeorm';

/**
 * Converts PostgreSQL `numeric` values (returned by node-postgres as strings)
 * to JavaScript numbers in entities, and passes numbers through to the database.
 * Keeps financial values predictable in code while preserving DB precision.
 */
export const MoneyTransformer: ValueTransformer = {
  from: (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    return Number(value);
  },
  to: (value: number | null): number | null => value,
};

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isPositiveCurrency(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isNonNegativeCurrency(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
