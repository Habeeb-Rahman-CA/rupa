import { Injectable } from '@angular/core';

const DB_NAME = 'rupa-vault';
const DB_VERSION = 1;
const STORE = 'secrets';
const KEY_ID = 'ai-api-key';

/** Versioned prefix so ciphertext is distinguishable from legacy plaintext. */
const ENC_PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const KEY_BYTES = 32; // AES-256

/**
 * Device-bound encryption key vault for the AI API key.
 *
 * A random AES-256-GCM key is generated once per device and kept **only** in
 * IndexedDB — never in localStorage and never in `app_settings` — so:
 *   * a localStorage dump yields nothing usable, and
 *   * casual inspection of the `app_settings` row shows only ciphertext.
 *
 * The plaintext key exists only in memory after `decrypt()`. The ciphertext
 * format is `enc:v1:<base64 iv>:<base64 ciphertext>`; values without that
 * prefix are legacy plaintext and are returned unchanged so callers can
 * migrate them.
 *
 * Note: because the key is device-bound, clearing site data (which wipes
 * IndexedDB) makes existing ciphertext unrecoverable — the API key must then
 * be re-entered (as plaintext in `app_settings`; the app re-encrypts it on the
 * next load).
 */
@Injectable({ providedIn: 'root' })
export class AiKeyVaultService {
  private cachedKey: CryptoKey | null = null;

  /** True when `value` is ciphertext produced by this vault. */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(ENC_PREFIX);
  }

  /**
   * Encrypt with the device-bound key. Returns
   * `enc:v1:<base64 iv>:<base64 ciphertext>` (fresh random IV per call).
   */
  async encrypt(plaintext: string): Promise<string> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toBuf(iv) },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${ENC_PREFIX}${b64(iv)}:${b64(new Uint8Array(ct))}`;
  }

  /**
   * Decrypt a value produced by `encrypt()`. A value without the versioned
   * prefix is legacy plaintext and is returned as-is (the caller migrates it).
   */
  async decrypt(value: string): Promise<string> {
    if (!this.isEncrypted(value)) return value;

    const body = value.slice(ENC_PREFIX.length);
    const sep = body.indexOf(':');
    if (sep < 0) throw new Error('Malformed encrypted value.');

    const iv = fromB64(body.slice(0, sep));
    const ct = fromB64(body.slice(sep + 1));
    const key = await this.getKey();
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBuf(iv) },
      key,
      toBuf(ct),
    );
    return new TextDecoder().decode(pt);
  }

  /** Load the device key from IndexedDB, generating it on first use. */
  private async getKey(): Promise<CryptoKey> {
    if (this.cachedKey) return this.cachedKey;

    let raw = await idbGetRaw();
    if (!raw) {
      raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
      await idbSetRaw(raw);
    }

    const key = await crypto.subtle.importKey(
      'raw',
      toBuf(raw),
      'AES-GCM',
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );
    this.cachedKey = key;
    return key;
  }
}

// --------------------------------------------------------------- IndexedDB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function idbGetRaw(): Promise<Uint8Array | null> {
  const db = await openDb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY_ID);
      req.onsuccess = () => {
        const rec = req.result as { id: string; key?: ArrayBuffer | Uint8Array } | undefined;
        if (!rec || rec.key == null) {
          resolve(null);
          return;
        }
        resolve(rec.key instanceof Uint8Array ? rec.key : new Uint8Array(rec.key));
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

async function idbSetRaw(raw: Uint8Array): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: KEY_ID, key: raw });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }
}

// ------------------------------------------------------------------ helpers

function toBuf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function b64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
