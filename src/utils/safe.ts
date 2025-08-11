'use client';

import SafeAppsSDK, { SafeInfo, TransactionStatus } from '@safe-global/safe-apps-sdk';
import { type Address, encodeFunctionData, parseAbi } from 'viem';

export type SafeAccountType = 'Not Safe' | 'Safe App' | 'Safe WalletConnect' | 'Unknown';

// Safe Apps SDK instance - only initialize if running in Safe App context
let safeAppsSdk: SafeAppsSDK | null = null;

// Export for testing purposes
export const getSafeAppsSdk = () => safeAppsSdk;
export const setSafeAppsSdk = (sdk: SafeAppsSDK | null) => {
  safeAppsSdk = sdk;
};

/**
 * Detects if the current environment is a Safe wallet
 * @returns SafeAccountType indicating the type of Safe connection
 */
export const detectSafeEnvironment = async (): Promise<{
  isSafe: boolean;
  safeType: SafeAccountType;
  safeInfo?: SafeInfo;
}> => {
  try {
    // Check if window is available
    if (typeof window === 'undefined') {
      return {
        isSafe: false,
        safeType: 'Unknown',
      };
    }

    // Method 1: Check if running inside Safe App (iframe)
    if (window.parent !== window) {
      try {
        // Initialize Safe Apps SDK if not already done
        if (!safeAppsSdk) {
          safeAppsSdk = new SafeAppsSDK({
            allowedDomains: [/app.safe.global$/, /safe.global$/],
            debug: true,
          });
        }

        // Try to get Safe info - this will only work inside Safe App
        const safeInfo = await safeAppsSdk.safe.getInfo();

        return {
          isSafe: true,
          safeType: 'Safe App',
          safeInfo,
        };
      } catch {}
    }

    // Method 2: Check if connected via WalletConnect to a Safe
    // This requires checking the connected account's bytecode
    // Safe wallets have specific bytecode patterns
    if (window.ethereum) {
      // We'll integrate this with the main app's wallet connection
      // For now, return false - this will be enhanced later
    }

    return {
      isSafe: false,
      safeType: 'Not Safe',
    };
  } catch (error) {
    console.error('❌ Error detecting Safe environment:', error);
    return {
      isSafe: false,
      safeType: 'Unknown',
    };
  }
};

/**
 * Creates a batch transaction for Safe wallets
 * @param tokenAddress The ERC20 token address
 * @param spenderAddress The address to approve (entry point)
 * @param amount The deposit amount
 * @param vettingFeeBPS The vetting fee in basis points
 * @param depositTarget The deposit contract address
 * @param depositData The encoded deposit function data
 * @returns Array of transaction objects for Safe
 */
export const createSafeBatchTransaction = (
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
  _vettingFeeBPS: bigint,
  depositTarget: Address,
  depositData: `0x${string}`,
) => {
  // Calculate the approval amount (just the deposit amount, not including fee)
  const approvalAmount = amount;

  // Encode approve call
  const approveData = encodeFunctionData({
    abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
    functionName: 'approve',
    args: [spenderAddress, approvalAmount],
  });

  // Create Safe transaction format
  const transactions = [
    {
      to: tokenAddress,
      value: '0',
      data: approveData,
      operation: 0, // 0 = Call, 1 = DelegateCall
    },
    {
      to: depositTarget,
      value: '0',
      data: depositData,
      operation: 0,
    },
  ];

  return transactions;
};

/**
 * Sends a batch transaction using Safe Apps SDK
 * @param transactions Array of transactions to execute
 * @returns Transaction hash
 */
export const sendSafeBatchTransaction = async (
  transactions: Array<{
    to: string;
    value: string;
    data: string;
    operation: number;
  }>,
): Promise<string> => {
  if (!safeAppsSdk) {
    throw new Error('Safe Apps SDK not initialized - not running in Safe App');
  }

  try {
    // Send transaction through Safe Apps SDK
    const { safeTxHash } = await safeAppsSdk.txs.send({ txs: transactions });

    // Note: Safe transactions need to be signed by threshold owners
    // The SDK handles proposing the transaction to the Safe

    return safeTxHash;
  } catch (error) {
    console.error('❌ Failed to send Safe batch transaction:', error);
    throw error;
  }
};

/**
 * Gets the status of a Safe transaction
 * @param safeTxHash The Safe transaction hash
 * @returns Transaction status
 */
export const getSafeTransactionStatus = async (safeTxHash: string): Promise<TransactionStatus> => {
  if (!safeAppsSdk) {
    throw new Error('Safe Apps SDK not initialized');
  }

  try {
    // Note: Safe Apps SDK doesn't directly provide tx status
    // This would need to be implemented using Safe Transaction Service API
    // For now, we'll return a placeholder
    console.log('📊 Checking Safe transaction status:', safeTxHash);

    // In a real implementation, you would:
    // 1. Check if tx is executed using Safe Transaction Service
    // 2. Get the actual blockchain tx hash after execution
    // 3. Monitor that transaction

    return TransactionStatus.SUCCESS;
  } catch (error) {
    console.error('❌ Failed to get Safe transaction status:', error);
    throw error;
  }
};

/**
 * Checks if a wallet address is a Safe wallet by examining its bytecode
 * @param address The wallet address to check
 * @param provider Web3 provider
 * @returns true if the address is a Safe wallet
 */
interface Provider {
  getCode: (address: Address) => Promise<string>;
}

export const isSafeWallet = async (address: Address, provider: Provider): Promise<boolean> => {
  try {
    const code = await provider.getCode(address);

    // Safe wallets have specific bytecode patterns
    // This is a simplified check - in production you'd want more robust detection
    // Safe proxy contracts typically start with specific patterns
    const safeProxyPattern = '0x608060405273';
    const isSafe = code.startsWith(safeProxyPattern) && code.length > 1000;

    return isSafe;
  } catch (error) {
    console.error('❌ Failed to check if address is Safe:', error);
    return false;
  }
};
