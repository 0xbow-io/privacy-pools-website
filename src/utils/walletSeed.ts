'use client';

// Derive a deterministic 12-word mnemonic from a wallet signature.
// - Prompts the user to sign a stable EIP-712 message in UI (outside this util)
// - Uses HKDF-SHA256 over the signature to derive 16 bytes of entropy
// - Converts entropy to a BIP39 mnemonic (English)

import { mnemonicFromEntropy } from './passkeySeed';

const textEncoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function hkdf(ikm: ArrayBuffer, salt: ArrayBuffer, info: ArrayBuffer, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

export async function deriveMnemonicFromWalletSignature(
  signatureHex: string,
  address: string,
  chainId: number,
): Promise<string> {
  const sigBytes = hexToBytes(signatureHex);
  const ikm = await sha256(sigBytes.buffer);
  const salt = await sha256(textEncoder.encode(`pp:wallet-seed|${chainId}|${address.toLowerCase()}`).buffer);
  const info = textEncoder.encode('privacy-pools/wallet-seed:v1');
  const entropy = await hkdf(ikm.buffer, salt.buffer, info.buffer, 16);
  return await mnemonicFromEntropy(entropy);
}
