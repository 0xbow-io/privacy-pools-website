'use client';

import { useCallback } from 'react';
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk';
import { BaseTransaction } from '@safe-global/safe-apps-sdk';
import { type Address, encodeFunctionData, parseAbi } from 'viem';

export interface SafeBatchTransaction {
  to: Address;
  value: string;
  data: string;
}

export const useSafeTransactions = () => {
  const { sdk, connected, safe } = useSafeAppsSDK();

  const createSafeBatchTransaction = useCallback(
    (
      tokenAddress: Address,
      spenderAddress: Address,
      amount: bigint,
      _vettingFeeBPS: bigint,
      depositTarget: Address,
      depositData: `0x${string}`,
    ): BaseTransaction[] => {
      // Create approval transaction
      const approveData = encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
        functionName: 'approve',
        args: [spenderAddress, amount],
      });

      const transactions: BaseTransaction[] = [
        {
          to: tokenAddress,
          value: '0',
          data: approveData,
        },
        {
          to: depositTarget,
          value: '0',
          data: depositData,
        },
      ];

      return transactions;
    },
    [],
  );

  const sendSafeBatchTransaction = useCallback(
    async (transactions: BaseTransaction[]): Promise<string> => {
      if (!connected || !sdk) {
        throw new Error('Safe App not connected');
      }

      try {
        const response = await sdk.txs.send({ txs: transactions });

        // The response might be an object with safeTxHash property
        const safeTxHash = typeof response === 'string' ? response : response.safeTxHash || response;

        if (typeof safeTxHash !== 'string') {
          throw new Error('Invalid Safe transaction hash format');
        }

        return safeTxHash;
      } catch (error) {
        throw error;
      }
    },
    [connected, sdk],
  );

  const getSafeTransactionStatus = useCallback(
    async (safeTxHash: string) => {
      if (!connected || !sdk) {
        throw new Error('Safe App not connected');
      }

      try {
        const safeTx = await sdk.txs.getBySafeTxHash(safeTxHash);
        return safeTx;
      } catch (error) {
        throw error;
      }
    },
    [connected, sdk],
  );

  const waitForSafeTransaction = useCallback(
    async (safeTxHash: string): Promise<string | null> => {
      if (!connected || !sdk) {
        throw new Error('Safe App not connected');
      }

      // Ensure we have a string hash
      if (typeof safeTxHash !== 'string') {
        return null;
      }

      // Poll for transaction status
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes with 5-second intervals

      while (attempts < maxAttempts) {
        try {
          const safeTx = await sdk.txs.getBySafeTxHash(safeTxHash);

          // Check if transaction has been executed
          if (safeTx && safeTx.txHash) {
            return safeTx.txHash;
          }

          // Wait before next attempt
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        } catch (error) {
          console.log(error);
          // Continue polling even if there's an error
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      return null;
    },
    [connected, sdk],
  );

  return {
    isSafeApp: connected,
    safe,
    createSafeBatchTransaction,
    sendSafeBatchTransaction,
    getSafeTransactionStatus,
    waitForSafeTransaction,
  };
};
