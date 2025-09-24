'use client';

// Signature-based seed derivation aligned with sigfuture.md.
// - EIP-712 signing payload must commit to the address hash (keccak256(A_secret)).
// - Derivation uses HKDF-Extract with IKM = r (from signature) and salt = A_secret (address bytes).
// - HKDF-Expand (via HKDF info) with appId to produce 16 bytes for a 12-word mnemonic.
// - Using audited @noble/hashes library for cryptographic operations

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { keccak256, toBytes } from 'viem';
import { english } from 'viem/accounts';

const textEncoder = new TextEncoder();

// Minimal BIP39 entropy -> mnemonic (English) implementation
function mnemonicFromEntropy(entropy: Uint8Array): string {
  const ENT = entropy.length * 8;
  const CS = ENT / 32;
  const hash = sha256(entropy);
  // Build bitstring of entropy + checksum
  const bits = bytesToBits(entropy) + bytesToBits(hash).slice(0, CS);
  const words: string[] = [];
  for (let i = 0; i < bits.length; i += 11) {
    const chunk = bits.slice(i, i + 11);
    if (chunk.length < 11) break;
    const idx = parseInt(chunk, 2);
    words.push(english[idx]);
  }
  return words.join(' ');
}

function bytesToBits(bytes: Uint8Array): string {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits;
}

export async function deriveMnemonicFromWalletSignature(signatureHex: string, address: string): Promise<string> {
  // Decode signature and extract r (first 32 bytes)
  const cleanHex = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  const sig = hexToBytes(cleanHex);
  if (sig.length < 65) throw new Error('Invalid signature length');
  const r = sig.slice(0, 32); // IKM for HKDF-Extract

  // Salt is the raw address bytes (A_secret)
  const addr = address.toLowerCase();
  const cleanAddr = addr.startsWith('0x') ? addr.slice(2) : addr;
  const addrBytes = hexToBytes(cleanAddr);

  // appId (HKDF info) binds derivation to this app/version
  const info = textEncoder.encode('privacy-pools/wallet-seed:v1');

  // Single HKDF call (Extract+Expand) using noble-hashes: IKM=r, salt=A_secret, info=appId, len=16 bytes
  const entropy = hkdf(sha256, r, addrBytes, info, 16);

  // Nullify sensitive signature data after use (security recommendation from auditor)
  r.fill(0);
  sig.fill(0);

  const mnemonic = mnemonicFromEntropy(entropy);

  // Clear entropy after use
  entropy.fill(0);

  return mnemonic;
}

// Build the EIP-712 typed data for seed derivation, committing to keccak256(address).
export function buildSeedDerivationTypedData(address: string) {
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
    context: 'privacy-pools/wallet-seed:v1',
    addressHash: addressHash as `0x${string}`,
  } as const;
  return { domain, types, message, primaryType: 'DeriveSeed' as const };
}
