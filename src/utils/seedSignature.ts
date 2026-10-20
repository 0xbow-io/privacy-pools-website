import { keccak256, recoverTypedDataAddress, toBytes, type Address, type Hex } from 'viem';

/**
 * Wallet-based key generation expects one standard secp256k1 signature made by the
 * connected EOA. Contract accounts sign in other formats, so the check is local signer
 * recovery: exactly 65 bytes, and the EIP-712 signer recovered here must be the connected
 * address. An EIP-7702 delegated EOA signs with its own key and passes.
 */
export const SEED_SIGNATURE_BYTES = 65;

export class SeedSignatureError extends Error {
  constructor(message = 'This wallet cannot be used for wallet-based key generation') {
    super(message);
    this.name = 'SeedSignatureError';
  }
}

export function assertSeedSignatureLength(sig: Uint8Array): void {
  if (sig.length !== SEED_SIGNATURE_BYTES) throw new SeedSignatureError('Invalid signature length');
}

type SeedTypedData = Parameters<typeof recoverTypedDataAddress>[0];

/** Throws SeedSignatureError unless `signature` is a 65-byte EIP-712 signature by `address` over `typedData`. */
export async function assertSignedByAddress(
  typedData: Omit<SeedTypedData, 'signature'>,
  signature: Hex,
  address: Address,
): Promise<void> {
  if ((signature.length - 2) / 2 !== SEED_SIGNATURE_BYTES) throw new SeedSignatureError('Invalid signature length');
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({ ...typedData, signature } as SeedTypedData);
  } catch {
    throw new SeedSignatureError('Invalid signature');
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new SeedSignatureError('The signature was not made by the connected address');
  }
}

// Build the EIP-712 typed data for seed derivation, committing to keccak256(address).
export function buildSeedDerivationTypedData(address: string, version: 'v1' | 'v2' = 'v2') {
  const addrBytes = toBytes(address as `0x${string}`);
  const addressHash = keccak256(addrBytes);
  const domain = { name: 'Privacy Pools', version: '1' } as const;
  const types = {
    DeriveSeed: [
      { name: 'action', type: 'string' },
      { name: 'context', type: 'string' },
      { name: 'addressHash', type: 'bytes32' },
    ],
  } as const;
  const message = {
    action: 'Derive Account Seed',
    context: `privacy-pools/wallet-seed:${version}`,
    addressHash: addressHash as `0x${string}`,
  } as const;
  return { domain, types, message, primaryType: 'DeriveSeed' as const };
}
