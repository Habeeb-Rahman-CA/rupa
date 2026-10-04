/**
 * Central error parsing utility.
 * Safely extracts a human-readable error message from an unknown thrown error.
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  if (err && typeof err === 'object') {
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      const msg = (err as { message: string }).message.trim();
      if (msg.length > 0) return msg;
    }
  }
  return fallback;
}

/**
 * Backwards compatible alias for getErrorMessage
 */
export const errText = getErrorMessage;
export const errorText = getErrorMessage;
