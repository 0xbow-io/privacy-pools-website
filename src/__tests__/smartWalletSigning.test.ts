import { hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  assertSeedSignatureLength,
  assertSignedByAddress,
  buildSeedDerivationTypedData,
  SeedSignatureError,
} from '~/utils/seedSignature';
import { detectSmartWalletType, isContractCode, isSmartContract } from '~/utils/smartWallets';

const ADDRESS = '0x1111111111111111111111111111111111111111' as const;
const provider = (code: string | undefined) => ({ getBytecode: async () => code });
const failingProvider = { getBytecode: async (): Promise<string | undefined> => Promise.reject(new Error('rpc down')) };

const eoa = privateKeyToAccount('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const other = privateKeyToAccount('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

describe('smart wallet detection for wallet-based key generation', () => {
  it('classifies deployed contract code as a smart contract', async () => {
    expect(await detectSmartWalletType(ADDRESS, provider('0x6080604052'))).toBe('Unknown Smart Contract');
    expect(await isSmartContract(ADDRESS, provider('0x6080604052'))).toBe(true);
  });

  it('keeps plain and exact EIP-7702 delegated EOAs on the EOA path', async () => {
    expect(await detectSmartWalletType(ADDRESS, provider(undefined))).toBe('Standard EOA');
    expect(await detectSmartWalletType(ADDRESS, provider('0x'))).toBe('Standard EOA');
    const delegation = '0xef0100' + '22'.repeat(20);
    expect(await detectSmartWalletType(ADDRESS, provider(delegation))).toBe('Standard EOA');
    expect(await detectSmartWalletType(ADDRESS, provider(delegation.toUpperCase().replace('0X', '0x')))).toBe(
      'Standard EOA',
    );
    expect(await isSmartContract(ADDRESS, provider(delegation))).toBe(false);
  });

  it('treats anything that is not an exact 23-byte delegation as contract code', () => {
    expect(isContractCode('0xef0100' + '22'.repeat(19))).toBe(true); // truncated
    expect(isContractCode('0xef0100' + '22'.repeat(21))).toBe(true); // extended
    expect(isContractCode('0x00')).toBe(true);
  });

  it('reports Unknown when the bytecode read fails, so the caller can fail closed', async () => {
    expect(await detectSmartWalletType(ADDRESS, failingProvider)).toBe('Unknown');
  });
});

describe('wallet seed signature checks', () => {
  it('length: accepts 65 bytes and nothing else', async () => {
    const sig = await eoa.signMessage({ message: 'seed' });
    expect(() => assertSeedSignatureLength(hexToBytes(sig))).not.toThrow();
    // 66 bytes: a signature plus a trailing byte.
    expect(() => assertSeedSignatureLength(hexToBytes(`${sig}01`))).toThrow(SeedSignatureError);
    // Much longer wrapped signatures.
    expect(() => assertSeedSignatureLength(hexToBytes(`${sig}${'ab'.repeat(200)}`))).toThrow(SeedSignatureError);
    // 64-byte input: the v byte dropped from the EOA signature (EIP-2098 compact sigs are also 64 bytes).
    expect(() => assertSeedSignatureLength(hexToBytes(sig.slice(0, 130) as `0x${string}`))).toThrow(SeedSignatureError);
  });

  it('accepts a signature the connected EOA made itself', async () => {
    const typedData = buildSeedDerivationTypedData(eoa.address, 'v2');
    const sig = await eoa.signTypedData(typedData);
    await expect(assertSignedByAddress(typedData, sig, eoa.address)).resolves.toBeUndefined();
  });

  it('rejects a 65-byte contract wallet signature made by its owner key', async () => {
    // A contract account may return its owner's 65-byte signature; the recovered signer is the
    // owner, not the connected address.
    // The payload the app builds for the connected (contract) address.
    const typedData = buildSeedDerivationTypedData(ADDRESS, 'v2');
    const ownerSig = await other.signTypedData(typedData);
    await expect(assertSignedByAddress(typedData, ownerSig, ADDRESS)).rejects.toThrow(SeedSignatureError);
  });

  it('rejects a signature over different data, and a 66-byte signature', async () => {
    // Signed for v1, checked as v2: different payload.
    const sig = await eoa.signTypedData(buildSeedDerivationTypedData(eoa.address, 'v1'));
    await expect(
      assertSignedByAddress(buildSeedDerivationTypedData(eoa.address, 'v2'), sig, eoa.address),
    ).rejects.toThrow(SeedSignatureError);
    const v2 = buildSeedDerivationTypedData(eoa.address, 'v2');
    const good = await eoa.signTypedData(v2);
    await expect(assertSignedByAddress(v2, `${good}01`, eoa.address)).rejects.toThrow(SeedSignatureError);
  });
});
