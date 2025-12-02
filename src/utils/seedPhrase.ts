import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';

export const generateSeedPhrase = (wordCount: 12 | 24 = 12) => {
  // 128 bits = 12 words, 256 bits = 24 words
  const strength = wordCount === 24 ? 256 : 128;
  return generateMnemonic(english, strength);
};

export const verifyAndSanitizeSeedPhrase = (seedPhrase: string) => {
  const sanitizedSeedPhrase = seedPhrase
    .replace(/[,\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = sanitizedSeedPhrase.split(' ');

  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Recovery phrase must be 12 or 24 words');
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
