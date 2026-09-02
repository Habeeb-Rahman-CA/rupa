import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats an amount as signed Indian-rupee currency, e.g.
 *   1234, 'out'  →  '− ₹1,234'
 *   1234, 'in'   →  '+ ₹1,234'
 *   1234, null   →  '₹1,234'
 *
 * Uses U+2212 MINUS SIGN (not hyphen) for visual balance with '+'.
 */
@Pipe({ name: 'signedMoney', standalone: true, pure: true })
export class SignedMoneyPipe implements PipeTransform {
  private readonly formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  transform(value: number | null | undefined, direction?: 'in' | 'out' | null): string {
    if (value == null || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    const formatted = this.formatter.format(abs);
    if (direction === 'in') return `+ ${formatted}`;
    if (direction === 'out') return `− ${formatted}`;
    if (value < 0) return `− ${formatted}`;
    return formatted;
  }
}
