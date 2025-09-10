import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'crypto';
import { deriveMnemonicFromWalletSignature } from '~/utils/walletSeed';

// Ensure Web Crypto is available for HKDF/subtle
// @ts-expect-error jsdom may not provide subtle by default
globalThis.crypto = webcrypto as unknown as Crypto;

describe('wallet-derived mnemonic determinism', () => {
  it('derives the same mnemonic 50 times from the same private key/signature flow', async () => {
    const chainId = 1;
    // 32-byte test private key (DO NOT USE IN PRODUCTION)
    const privateKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = privateKeyToAccount(privateKey);

    const domain = { name: 'Privacy Pools', version: '1', chainId } as const;
    const types = {
      DeriveSeed: [
        { name: 'action', type: 'string' },
        { name: 'context', type: 'string' },
      ],
    } as const;
    const message = {
      action: 'Derive Account Seed',
      context: 'privacy-pools/wallet-seed:v1',
    } as const;

    const mnemonics: string[] = [];
    for (let i = 0; i < 50; i++) {
      const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'DeriveSeed',
        message,
      });
      const mnemonic = await deriveMnemonicFromWalletSignature(signature, account.address, chainId);
      mnemonics.push(mnemonic);
    }

    // All derived mnemonics should match the first one
    const first = mnemonics[0];
    expect(first).toBeDefined();
    expect(first.split(' ').length).toBe(12);
    for (const m of mnemonics) expect(m).toBe(first);
  });
});
