'use client';

import { Hex } from 'viem';
import { getWithdrawalFee } from '~/utils';

interface TransactionFeeData {
  actualReceivedAmount: bigint | null;
  fee: bigint | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fee and received amount of a withdrawal row, without a request.
 *
 * This hook used to POST `eth_getTransactionReceipt`, `eth_getTransactionByHash`
 * and `trace_transaction` for the withdrawal's hash whenever the details modal
 * opened. A relayed hash is not ours to name, and the modal opening is not a
 * moment worth announcing.
 *
 * Now the exact split comes from the `WithdrawalRelayed` log the withdraw flow
 * decoded from bulk block data when it confirmed the transaction
 * (utils/relayedReceipt.ts). Rows this session did not confirm itself have no
 * record and return nulls; the details modal then falls back to the relayer's
 * quoted BPS, as it did before the on-chain lookup existed.
 */
export const useTransactionFee = (txHash: Hex | undefined, withdrawalAmount: bigint): TransactionFeeData => {
  const recorded = txHash && withdrawalAmount > 0n ? getWithdrawalFee(txHash) : undefined;

  return {
    actualReceivedAmount: recorded?.received ?? null,
    fee: recorded?.fee ?? null,
    isLoading: false,
    error: null,
  };
};
