import { Injectable, computed, signal } from '@angular/core';
import { DEVICE_KEYS } from '../config/storage-keys';

export type AiConsentState = 'unknown' | 'granted' | 'denied';

/** localStorage key for the recorded AI-scan consent choice (per device). */
const STORAGE_KEY = DEVICE_KEYS.AI_CONSENT;

function readStored(): AiConsentState {
  if (typeof localStorage === 'undefined') return 'unknown';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : 'unknown';
  } catch {
    // Private mode / storage disabled — behave as "no choice yet".
    return 'unknown';
  }
}

/**
 * Records the user's explicit consent before a receipt image is sent to an
 * external AI provider.
 *
 * The choice is persisted in localStorage (per device) so scanning is blocked
 * until the user has granted permission, and a granted choice is remembered
 * across sessions without re-prompting. This is intentionally device-local:
 * consent is a privacy decision that should be re-confirmed on each device.
 */
@Injectable({
  providedIn: 'root',
})
export class AiConsentService {
  private readonly _state = signal<AiConsentState>(readStored());
  readonly state = this._state.asReadonly();

  /** True only after an explicit "Allow" — the gate for AI scanning. */
  readonly granted = computed(() => this._state() === 'granted');

  grant(): void {
    this.persist('granted');
  }

  deny(): void {
    this.persist('denied');
  }

  private persist(next: AiConsentState): void {
    this._state.set(next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore quota / private-mode failures — the in-memory signal still holds.
    }
  }
}
