'use client';

// Derive a deterministic 12-word mnemonic from a wallet signature.
// - Prompts the user to sign a stable EIP-712 message in UI (outside this util)
// - Uses HKDF-SHA256 over the signature to derive 16 bytes of entropy
// - Converts entropy to a BIP39 mnemonic (English)

import { english } from 'viem/accounts';

const textEncoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const g = globalThis as unknown as { crypto?: Crypto };
  const subtle: SubtleCrypto | undefined = g.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', data);
    return new Uint8Array(digest);
  }
  try {
    const nodeCrypto = (await import('crypto')) as typeof import('crypto');
    const hash = nodeCrypto.createHash('sha256');
    hash.update(Buffer.from(data));
    return new Uint8Array(hash.digest());
  } catch {
    throw new Error('SHA-256 not available');
  }
}

async function hkdf(ikm: ArrayBuffer, salt: ArrayBuffer, info: ArrayBuffer, length = 32): Promise<Uint8Array> {
  const g = globalThis as unknown as { crypto?: Crypto };
  const subtle: SubtleCrypto | undefined = g.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
    return new Uint8Array(bits);
  }
  try {
    const nodeCrypto = (await import('crypto')) as typeof import('crypto');
    const out = nodeCrypto.hkdfSync('sha256', Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), length);
    return new Uint8Array(out);
  } catch {
    throw new Error('HKDF not available');
  }
}

// Minimal BIP39 entropy -> mnemonic (English) implementation
async function mnemonicFromEntropy(entropy: Uint8Array): Promise<string> {
  const ENT = entropy.length * 8;
  const CS = ENT / 32;
  const hash = await sha256(entropy.buffer);
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
  console.log('Deriving mnemonic from wallet signature:');
  console.log('- Signature:', signatureHex);
  console.log('- Address:', address);

  const sigBytes = hexToBytes(signatureHex);
  const ikm = await sha256(sigBytes.buffer);
  const salt = await sha256(textEncoder.encode(`pp:wallet-seed|${address.toLowerCase()}`).buffer);
  const info = textEncoder.encode('privacy-pools/wallet-seed:v1');
  const entropy = await hkdf(ikm.buffer, salt.buffer, info.buffer, 16);

  console.log(
    '- IKM hash:',
    Array.from(ikm)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16) + '...',
  );
  console.log(
    '- Salt hash:',
    Array.from(salt)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16) + '...',
  );
  console.log(
    '- Entropy:',
    Array.from(entropy)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );

  const mnemonic = await mnemonicFromEntropy(entropy);
  console.log('- First 3 words:', mnemonic.split(' ').slice(0, 3).join(' '));

  return mnemonic;
}
