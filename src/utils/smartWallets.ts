'use client';

import { type Address } from 'viem';

export type SmartWalletType = 'Standard EOA' | 'Safe Wallet' | 'Unknown Smart Contract' | 'Unknown';

// Known contract addresses for detection
export const KNOWN_ADDRESSES = {
  // Safe factory address
  SAFE_FACTORY: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
} as const;

interface BytecodeProvider {
  getBytecode: (args: { address: Address }) => Promise<string | undefined>;
}

// EIP-7702 delegation designator: exactly 0xef0100 || 20-byte address (23 bytes). The account
// is still an EOA that signs with its own key, so it is not a contract wallet for key generation.
const EIP7702_DELEGATION = /^0xef0100[0-9a-f]{40}$/i;

export const isContractCode = (code: string | undefined): boolean =>
  code !== undefined && code !== '0x' && code.length > 2 && !EIP7702_DELEGATION.test(code);

/**
 * Detects if an address is a smart contract by checking bytecode
 */
export const isSmartContract = async (address: Address, provider: BytecodeProvider): Promise<boolean> => {
  try {
    const code = await provider.getBytecode({ address });
    return isContractCode(code);
  } catch (error) {
    console.error('Error checking bytecode:', error);
    return false;
  }
};

/**
 * Comprehensive smart wallet detection.
 * Returns 'Unknown' when the bytecode read fails, so callers can fail closed.
 */
export const detectSmartWalletType = async (address: Address, provider: BytecodeProvider): Promise<SmartWalletType> => {
  try {
    const code = await provider.getBytecode({ address });
    if (!isContractCode(code)) {
      return 'Standard EOA';
    }

    // For now, we'll return Unknown Smart Contract for all smart contracts
    // Safe detection is handled separately through the Safe SDK
    return 'Unknown Smart Contract';
  } catch (error) {
    console.error('❌ Error in smart wallet detection:', error);
    return 'Unknown';
  }
};

/**
 * Checks if a smart wallet supports batching
 */
export const supportsSmartWalletBatching = (walletType: SmartWalletType): boolean => {
  const batchingSupportedWallets: SmartWalletType[] = ['Safe Wallet'];

  return batchingSupportedWallets.includes(walletType);
};
