'use client';

// Deterministic seed generation from a WebAuthn passkey.
// - Creates (or reuses) a passkey
// - Derives 16 bytes of entropy via HKDF-SHA256 from the passkey public key
// - Converts entropy to a 12-word BIP39 mnemonic (English wordlist)

import { english } from 'viem/accounts';

const STORAGE_KEYS = {
  userId: 'pp_passkey_user_id',
  credentialId: 'pp_passkey_cred_id',
  publicKey: 'pp_passkey_pubkey_der', // base64url-encoded DER SubjectPublicKeyInfo if available
};

const textEncoder = new TextEncoder();

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Removed fromBase64Url - no longer needed

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function hkdf(ikm: ArrayBuffer, salt: ArrayBuffer, info: ArrayBuffer, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// Minimal BIP39 entropy -> mnemonic (English) implementation
export async function mnemonicFromEntropy(entropy: Uint8Array): Promise<string> {
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

async function getDeterministicUserId(): Promise<Uint8Array> {
  // Create a deterministic user ID based on the domain
  // This ensures the same user ID across all sessions without localStorage
  const domain = getRpId();
  const userIdSource = `privacy-pools-user-${domain}`;
  const hash = await sha256(textEncoder.encode(userIdSource).buffer);
  return hash;
}

function getRpId(): string {
  // Standard RP ID is the effective domain
  try {
    return window.location.hostname;
  } catch {
    return 'localhost';
  }
}

// Removed getStoredKeyMaterial - no longer needed with new approach

async function createPasskey(): Promise<{ credentialId: Uint8Array; publicKeyDer?: Uint8Array }> {
  const userId = await getDeterministicUserId();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rpId = getRpId();

  const username = 'privacy-pools-user';
  const displayName = 'Privacy Pools User';

  const pubKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { id: rpId, name: 'Privacy Pools' },
    user: {
      id: userId,
      name: username,
      displayName: displayName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -8 }, // EdDSA
    ],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  };

  const credential = (await navigator.credentials.create({ publicKey: pubKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey creation was cancelled.');

  const credId = new Uint8Array(credential.rawId);
  let publicKeyDer: Uint8Array | undefined;
  try {
    const response = credential.response as AuthenticatorAttestationResponse & {
      getPublicKey?: () => ArrayBuffer | null;
    };
    if (response.getPublicKey) {
      const pk = response.getPublicKey();
      if (pk) publicKeyDer = new Uint8Array(pk);
    }
  } catch {}

  localStorage.setItem(STORAGE_KEYS.credentialId, toBase64Url(credId.buffer));
  if (publicKeyDer) localStorage.setItem(STORAGE_KEYS.publicKey, toBase64Url(publicKeyDer.buffer));

  return { credentialId: credId, publicKeyDer };
}

// Removed assertPasskey - no longer needed with new approach

async function deriveEntropyFromKeyMaterial(credentialId: Uint8Array, publicKeyDer?: Uint8Array): Promise<Uint8Array> {
  // Use publicKey DER if available; otherwise fall back to credentialId.
  const ikmSource = publicKeyDer ?? credentialId;
  const ikm = await sha256(ikmSource.buffer);
  const salt = await sha256(textEncoder.encode(getRpId()).buffer);
  const info = textEncoder.encode('privacy-pools/passkey-seed:v1');
  // 16 bytes entropy for 12-word mnemonic
  const out = await hkdf(ikm.buffer, salt.buffer, info.buffer, 16);
  return out;
}

export async function generateMnemonicFromPasskey(): Promise<{
  mnemonic: string;
  created: boolean; // true if a new passkey was created in this flow
}> {
  if (typeof window === 'undefined') throw new Error('Must be run in browser');
  if (!('credentials' in navigator)) throw new Error('WebAuthn is not supported on this browser');

  let created = false;
  let credentialId: Uint8Array | undefined;
  let publicKeyDer: Uint8Array | undefined;

  try {
    // First, try to use an existing passkey (including cloud-synced ones)
    // This will show ALL available passkeys for this RP
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rpId = getRpId();

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        userVerification: 'preferred',
        timeout: 60_000,
        // Don't specify allowCredentials - let the browser show all available passkeys
      },
    })) as PublicKeyCredential;

    if (assertion) {
      credentialId = new Uint8Array(assertion.rawId);
      // Store for future use
      localStorage.setItem(STORAGE_KEYS.credentialId, toBase64Url(credentialId.buffer));
      console.log('Using existing passkey (possibly cloud-synced)');
    }
  } catch {
    console.log('No existing passkey found, creating new one...');
    // No existing passkey, create a new one
    const createdCred = await createPasskey();
    credentialId = createdCred.credentialId;
    publicKeyDer = createdCred.publicKeyDer;
    created = true;
  }

  if (!credentialId) {
    throw new Error('Failed to obtain passkey');
  }

  const entropy = await deriveEntropyFromKeyMaterial(credentialId, publicKeyDer);
  const mnemonic = await mnemonicFromEntropy(entropy);
  console.log('Generated mnemonic from passkey, created:', created);
  return { mnemonic, created };
}
