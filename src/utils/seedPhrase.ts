import encryptpwd from 'encrypt-with-password';
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';

export const generateSeedPhrase = () => {
  return generateMnemonic(english);
};

export const verifyAndSanitizeSeedPhrase = (seedPhrase: string) => {
  const sanitizedSeedPhrase = seedPhrase
    .replace(/[,\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = sanitizedSeedPhrase.split(' ');

  if (words.length !== 12) {
    throw new Error('Recovery phrase must be 12 words');
  }

  if (words.some((word) => !english.includes(word))) {
    throw new Error('Recovery phrase contains invalid words');
  }

  try {
    mnemonicToAccount(sanitizedSeedPhrase);
  } catch {
    throw new Error('Invalid recovery phrase');
  }

  return sanitizedSeedPhrase;
};

export const encryptSeedPhrase = (seedPhrase: string, password: string) => {
  verifyAndSanitizeSeedPhrase(seedPhrase);
  if (!seedPhrase || !password) {
    throw new Error('Seed phrase and password are required for encryption');
  }

  return encryptpwd(seedPhrase, password);
};

export const decryptSeedPhrase = (encryptedSeedPhrase: string, password: string) => {
  if (!encryptedSeedPhrase || !password) {
    throw new Error('Encrypted seed phrase and password are required for decryption');
  }

  const decryptedSeedPhrase = encryptpwd.decrypt(encryptedSeedPhrase, password);
  verifyAndSanitizeSeedPhrase(decryptedSeedPhrase);
  return decryptedSeedPhrase;
};
