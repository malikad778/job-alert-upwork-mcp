import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, hint } from '../src/crypto/encryption';

describe('AES-256-GCM Envelope Encryption', () => {
  const masterKey = randomBytes(32);

  it('correctly encrypts and decrypts basic strings', () => {
    const secret = 'my-super-secret-upwork-token';
    const ciphertext = encrypt(secret, masterKey);
    expect(ciphertext).toMatch(/^v1\..+\..+\..+$/);
    const plaintext = decrypt(ciphertext, masterKey);
    expect(plaintext).toBe(secret);
  });

  it('guarantees IV randomness: identical plaintexts produce different ciphertexts', () => {
    const secret = 'constant-secret-value';
    const cipher1 = encrypt(secret, masterKey);
    const cipher2 = encrypt(secret, masterKey);
    expect(cipher1).not.toBe(cipher2);
    expect(decrypt(cipher1, masterKey)).toBe(secret);
    expect(decrypt(cipher2, masterKey)).toBe(secret);
  });

  it('passes 1,000 round-trip encryptions with random strings and unicode', () => {
    for (let i = 0; i < 1000; i++) {
      const length = Math.floor(Math.random() * 200) + 1;
      const unicodeString = randomBytes(length).toString('base64') + ' 🚀 🔒 💻 العربية 中文 éàü';
      const encrypted = encrypt(unicodeString, masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toBe(unicodeString);
    }
  });

  it('throws on tampered ciphertext or authentication tag mismatch', () => {
    const secret = 'sensitive-data';
    const encrypted = encrypt(secret, masterKey);
    const parts = encrypted.split('.');
    // Tamper ciphertext
    const tamperedCt = parts[0] + '.' + parts[1] + '.' + parts[2] + '.' + Buffer.from('corrupted').toString('base64');
    expect(() => decrypt(tamperedCt, masterKey)).toThrow();
  });

  it('generates non-reversible secret hints', () => {
    expect(hint('short')).toBe('••••');
    expect(hint('sk-ant-api03-1234567890abcdef')).toBe('sk-a…cdef');
  });
});
