import { TestBed } from '@angular/core/testing';

import { AiKeyVaultService } from './ai-key-vault.service';

const DB_NAME = 'rupa-vault';

/** Removes the device key so each test starts from a clean vault. */
function deleteVaultDb(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('AiKeyVaultService', () => {
  let service: AiKeyVaultService;

  beforeEach(async () => {
    await deleteVaultDb();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiKeyVaultService);
  });

  afterEach(async () => {
    TestBed.resetTestingModule();
    await deleteVaultDb();
  });

  it('round-trips a key through encrypt → decrypt', async () => {
    const plaintext = 'sk-test-1234567890';

    const ciphertext = await service.encrypt(plaintext);

    expect(await service.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces versioned ciphertext that never contains the plaintext', async () => {
    const plaintext = 'sk-super-secret';

    const ciphertext = await service.encrypt(plaintext);

    expect(ciphertext.startsWith('enc:v1:')).toBeTrue();
    expect(ciphertext).not.toContain(plaintext);
    expect(service.isEncrypted(ciphertext)).toBeTrue();
  });

  it('uses a fresh IV per encryption (same input, different ciphertext)', async () => {
    const a = await service.encrypt('same-input');
    const b = await service.encrypt('same-input');

    expect(a).not.toBe(b);
    expect(await service.decrypt(a)).toBe('same-input');
    expect(await service.decrypt(b)).toBe('same-input');
  });

  it('persists the device key across service instances', async () => {
    const ciphertext = await service.encrypt('persisted-key');

    // A brand-new instance (as after an app reload) reads the same IndexedDB
    // key and can still decrypt.
    const fresh = new AiKeyVaultService();

    expect(await fresh.decrypt(ciphertext)).toBe('persisted-key');
  });

  it('passes legacy plaintext through unchanged for migration', async () => {
    expect(service.isEncrypted('sk-plain-legacy')).toBeFalse();
    expect(await service.decrypt('sk-plain-legacy')).toBe('sk-plain-legacy');
  });

  it('rejects tampered ciphertext (GCM authentication)', async () => {
    const ciphertext = await service.encrypt('original');
    const [prefix, iv, ct] = ciphertext.split(':');
    const tampered = `${prefix}:${iv}:${ct.slice(0, -4)}AAAA`;

    await expectAsync(service.decrypt(tampered)).toBeRejected();
  });
});
