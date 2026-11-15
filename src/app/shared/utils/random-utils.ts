/**
 * Cryptographically random helpers for the MPIN keypad.
 * Uses `crypto.getRandomValues` (standard browser API) — not `Math.random`.
 */

/** Fisher–Yates shuffle of [0..9]. Every digit appears exactly once. */
export function shuffleDigits(): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const random = new Uint32Array(digits.length);
  crypto.getRandomValues(random);
  for (let i = digits.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}
