'use client';

import { useQuery } from '@tanstack/react-query';
import { Hex, decodeEventLog, erc20Abi } from 'viem';
import { chainData } from '~/config';
import { useChainContext } from '~/hooks';

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface TransactionFeeData {
  actualReceivedAmount: bigint | null;
  fee: bigint | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches the actual received amount from a withdrawal transaction
 * by looking at the Transfer event logs in the transaction receipt.
 */
export const useTransactionFee = (
  txHash: Hex | undefined,
  withdrawalAmount: bigint,
  recipientAddress?: string,
): TransactionFeeData => {
  const { chainId, selectedPoolInfo } = useChainContext();
  const chain = chainData[chainId];
  const isNativeToken = selectedPoolInfo?.isNativeToken;

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactionFee', txHash, chainId],
    queryFn: async () => {
      if (!txHash || !chain) {
        return null;
      }

      // Use the hypersync RPC endpoint
      const rpcUrl = chain.sdkRpcUrl;

      // Fetch transaction receipt
      const receiptResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      });

      const receiptData = await receiptResponse.json();
      const receipt = receiptData.result;

      if (!receipt || !receipt.logs) {
        return null;
      }

      if (isNativeToken) {
        // For native token (ETH/BNB), we need to look at internal transactions
        // or trace the transaction to find the actual transfer amount
        // For now, fetch the transaction to get the value
        const txResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionByHash',
            params: [txHash],
            id: 2,
          }),
        });

        const txData = await txResponse.json();
        const tx = txData.result;

        // For native withdrawals, we need to trace internal calls
        // Try debug_traceTransaction if available, otherwise fall back to trace
        try {
          const traceResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'trace_transaction',
              params: [txHash],
              id: 3,
            }),
          });

          const traceData = await traceResponse.json();

          if (traceData.result && Array.isArray(traceData.result)) {
            // Find the transfer to the recipient
            const recipientLower = recipientAddress?.toLowerCase();
            for (const trace of traceData.result) {
              if (
                trace.action?.callType === 'call' &&
                trace.action?.to?.toLowerCase() === recipientLower &&
                trace.action?.value
              ) {
                const receivedAmount = BigInt(trace.action.value);
                return {
                  actualReceivedAmount: receivedAmount,
                  fee: withdrawalAmount - receivedAmount,
                };
              }
            }
          }
        } catch {
          // Trace not available, fall back to tx value (less accurate)
          if (tx?.value) {
            const receivedAmount = BigInt(tx.value);
            return {
              actualReceivedAmount: receivedAmount,
              fee: withdrawalAmount - receivedAmount,
            };
          }
        }

        return null;
      }

      // For ERC20 tokens, find all Transfer events for the asset
      const assetAddress = selectedPoolInfo?.assetAddress?.toLowerCase();
      const entryPointAddress = selectedPoolInfo?.entryPointAddress?.toLowerCase();

      // Collect all transfer amounts from entrypoint (these are the outgoing transfers)
      const transfersFromEntrypoint: { to: string; value: bigint }[] = [];

      for (const log of receipt.logs) {
        // Check if this is a Transfer event from the asset contract
        if (log.topics[0] === TRANSFER_EVENT_SIGNATURE && log.address?.toLowerCase() === assetAddress) {
          try {
            const decoded = decodeEventLog({
              abi: erc20Abi,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === 'Transfer') {
              const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };

              // We're looking for transfers FROM the entrypoint (outgoing transfers after withdrawal)
              if (from.toLowerCase() === entryPointAddress) {
                transfersFromEntrypoint.push({ to, value });
              }
            }
          } catch {
            // Failed to decode, continue to next log
            continue;
          }
        }
      }

      // If we found transfers from entrypoint, the largest one is likely the recipient amount
      // and the smaller one(s) are fees
      if (transfersFromEntrypoint.length > 0) {
        // Sort by value descending - largest is the recipient amount
        transfersFromEntrypoint.sort((a, b) => (b.value > a.value ? 1 : -1));

        const largestTransfer = transfersFromEntrypoint[0];
        const actualReceived = largestTransfer.value;
        const fee = withdrawalAmount - actualReceived;

        return {
          actualReceivedAmount: actualReceived,
          fee: fee > 0n ? fee : 0n,
        };
      }

      return null;
    },
    enabled: !!txHash && !!chain && withdrawalAmount > 0n,
    staleTime: Infinity, // Transaction data doesn't change
    gcTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  return {
    actualReceivedAmount: data?.actualReceivedAmount ?? null,
    fee: data?.fee ?? null,
    isLoading,
    error: error as Error | null,
  };
};
