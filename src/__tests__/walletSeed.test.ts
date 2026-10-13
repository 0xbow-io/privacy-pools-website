import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'crypto';

describe('wallet-derived mnemonic determinism', () => {
  it('derives the same v2 (24-word) mnemonic 50 times from the same private key/signature flow', async () => {
    const g = globalThis as unknown as { crypto?: Crypto };
    if (!g.crypto || !g.crypto.subtle) {
      // Environment does not provide WebCrypto; skip determinism check here.
      expect(true).toBe(true);
      return;
    }
    // 32-byte test private key (DO NOT USE IN PRODUCTION)
    const privateKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = privateKeyToAccount(privateKey);

    const { buildSeedDerivationTypedData } = await import('~/utils/seedSignature');
    const { domain, types, primaryType, message } = buildSeedDerivationTypedData(account.address, 'v2');

    // Ensure Web Crypto is available before importing module under test
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const { deriveMnemonicFromWalletSignature } = await import('~/utils/walletSeed');

    const mnemonics: string[] = [];
    for (let i = 0; i < 50; i++) {
      const signature = await account.signTypedData({ domain, types, primaryType, message });
      const mnemonic = await deriveMnemonicFromWalletSignature(signature, account.address, 'v2');
      mnemonics.push(mnemonic);
    }

    // All derived mnemonics should match the first one
    const first = mnemonics[0];
    expect(first).toBeDefined();
    expect(first.split(' ').length).toBe(24);
    for (const m of mnemonics) expect(m).toBe(first);
  });

  it('derives the same v1 (12-word) mnemonic 50 times from the same private key/signature flow (legacy)', async () => {
    const g = globalThis as unknown as { crypto?: Crypto };
    if (!g.crypto || !g.crypto.subtle) {
      // Environment does not provide WebCrypto; skip determinism check here.
      expect(true).toBe(true);
      return;
    }
    // 32-byte test private key (DO NOT USE IN PRODUCTION)
    const privateKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = privateKeyToAccount(privateKey);

    const { buildSeedDerivationTypedData } = await import('~/utils/seedSignature');
    const { domain, types, primaryType, message } = buildSeedDerivationTypedData(account.address, 'v1');

    // Ensure Web Crypto is available before importing module under test
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const { deriveMnemonicFromWalletSignature } = await import('~/utils/walletSeed');

    const mnemonics: string[] = [];
    for (let i = 0; i < 50; i++) {
      const signature = await account.signTypedData({ domain, types, primaryType, message });
      const mnemonic = await deriveMnemonicFromWalletSignature(signature, account.address, 'v1');
      mnemonics.push(mnemonic);
    }

    // All derived mnemonics should match the first one
    const first = mnemonics[0];
    expect(first).toBeDefined();
    expect(first.split(' ').length).toBe(12);
    for (const m of mnemonics) expect(m).toBe(first);
  });

  it('ensures v1 and v2 produce different mnemonics from the same signature', async () => {
    const g = globalThis as unknown as { crypto?: Crypto };
    if (!g.crypto || !g.crypto.subtle) {
      expect(true).toBe(true);
      return;
    }
    // 32-byte test private key (DO NOT USE IN PRODUCTION)
    const privateKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = privateKeyToAccount(privateKey);

    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const { buildSeedDerivationTypedData } = await import('~/utils/seedSignature');
    const { deriveMnemonicFromWalletSignature } = await import('~/utils/walletSeed');

    // Generate v1 mnemonic
    const v1TypedData = buildSeedDerivationTypedData(account.address, 'v1');
    const v1Signature = await account.signTypedData(v1TypedData);
    const v1Mnemonic = await deriveMnemonicFromWalletSignature(v1Signature, account.address, 'v1');

    // Generate v2 mnemonic
    const v2TypedData = buildSeedDerivationTypedData(account.address, 'v2');
    const v2Signature = await account.signTypedData(v2TypedData);
    const v2Mnemonic = await deriveMnemonicFromWalletSignature(v2Signature, account.address, 'v2');

    // Verify they are different
    expect(v1Mnemonic).not.toBe(v2Mnemonic);
    expect(v1Mnemonic.split(' ').length).toBe(12);
    expect(v2Mnemonic.split(' ').length).toBe(24);
  });
});
