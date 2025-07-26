// test functions in seedPhrase.ts

import { describe, it, expect } from '@jest/globals';
import { mnemonicToAccount } from 'viem/accounts';
import {
  generateSeedPhrase,
  verifyAndSanitizeSeedPhrase,
  encryptSeedPhrase,
  decryptSeedPhrase,
} from '~/utils/seedPhrase';

describe('seedPhrase', () => {
  const validSeedPhrase = 'pear stone nephew summer west purpose load anger robust circle addict memory';
  const invalidWordSeedPhrase = validSeedPhrase.replace('pear', '1nv4l1d');
  const invalidLengthSeedPhrase = validSeedPhrase.split(' ').slice(0, 11).join(' ');

  it('should generate a valid seed phrase', () => {
    const seedPhrase = generateSeedPhrase();

    expect(seedPhrase).toBeDefined();
    expect(seedPhrase.split(' ').length).toBe(12);
    expect(mnemonicToAccount(seedPhrase)).toBeDefined();
  });

  it('should verify and sanitize a seed phrase', () => {
    const seedPhraseWithCommas = validSeedPhrase.replace(' ', ',');
    const sanitizedSeedPhrase = verifyAndSanitizeSeedPhrase(seedPhraseWithCommas);

    expect(sanitizedSeedPhrase).toBe(validSeedPhrase);
  });

  it('should throw an error if the seed phrase is not 12 words', () => {
    const seedPhrase11Words = invalidLengthSeedPhrase;

    expect(() => verifyAndSanitizeSeedPhrase(seedPhrase11Words)).toThrow();
  });

  it('should throw an error if the seed phrase contains invalid words', () => {
    expect(() => verifyAndSanitizeSeedPhrase(invalidWordSeedPhrase)).toThrow();
  });

  describe('encryption and decryption', () => {
    const password = 'testPassword123';

    it('should encrypt a seed phrase with a password', () => {
      const encryptedSeedPhrase = encryptSeedPhrase(validSeedPhrase, password);

      expect(encryptedSeedPhrase).toBeDefined();
      expect(typeof encryptedSeedPhrase).toBe('string');
      expect(encryptedSeedPhrase).not.toBe(validSeedPhrase);
      expect(encryptedSeedPhrase.length).toBeGreaterThan(0);
    });

    it('should decrypt an encrypted seed phrase with the correct password', async () => {
      const encryptedSeedPhrase = encryptSeedPhrase(validSeedPhrase, password);
      const decryptedSeedPhrase = await decryptSeedPhrase(encryptedSeedPhrase, password);

      expect(decryptedSeedPhrase).toBe(validSeedPhrase);
    });

    it('should throw an error when decrypting with wrong password', async () => {
      const encryptedSeedPhrase = encryptSeedPhrase(validSeedPhrase, password);

      await expect(decryptSeedPhrase(encryptedSeedPhrase, 'wrongPassword')).rejects.toThrow();
    });

    it('should throw an error when decrypting invalid encrypted data', async () => {
      const invalidEncryptedData = 'invalid-encrypted-data';

      await expect(decryptSeedPhrase(invalidEncryptedData, password)).rejects.toThrow();
    });

    it('should throw an error when encrypted data is empty', async () => {
      await expect(decryptSeedPhrase('', password)).rejects.toThrow();
    });

    it('should throw an error when password is empty', async () => {
      const encryptedSeedPhrase = encryptSeedPhrase(validSeedPhrase, password);

      await expect(decryptSeedPhrase(encryptedSeedPhrase, '')).rejects.toThrow();
    });

    it('should handle different passwords for encryption', () => {
      const encryptedWithPassword1 = encryptSeedPhrase(validSeedPhrase, 'password1');
      const encryptedWithPassword2 = encryptSeedPhrase(validSeedPhrase, 'password2');

      expect(encryptedWithPassword1).not.toBe(encryptedWithPassword2);
    });

    it('should encrypt and decrypt with special characters in password', async () => {
      const specialPassword = 'p@ssw0rd!#$%^&*()_+';
      const encryptedSeedPhrase = encryptSeedPhrase(validSeedPhrase, specialPassword);
      const decryptedSeedPhrase = await decryptSeedPhrase(encryptedSeedPhrase, specialPassword);

      expect(decryptedSeedPhrase).toBe(validSeedPhrase);
    });

    it('should maintain seed phrase integrity after encrypt/decrypt cycle', async () => {
      const originalSeedPhrase = generateSeedPhrase();
      const encryptedSeedPhrase = encryptSeedPhrase(originalSeedPhrase, password);
      const decryptedSeedPhrase = await decryptSeedPhrase(encryptedSeedPhrase, password);

      expect(decryptedSeedPhrase).toBe(originalSeedPhrase);
      // Verify the decrypted seed phrase is still valid
      expect(() => mnemonicToAccount(decryptedSeedPhrase)).not.toThrow();
    });
  });
});
