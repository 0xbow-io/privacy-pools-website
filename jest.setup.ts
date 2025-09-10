import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

Object.assign(global, { TextDecoder, TextEncoder });

global.URL.createObjectURL = jest.fn(() => 'mock-url');

// Ensure Web Crypto API (subtle/HKDF) is available in tests
// @ts-ignore
global.crypto = webcrypto as unknown as Crypto;
// Ensure window.crypto also available
// @ts-ignore
if (typeof window !== 'undefined') (window as unknown as any).crypto = global.crypto;
