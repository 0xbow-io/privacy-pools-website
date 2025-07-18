'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Address } from 'viem';
import { useQuoteContext } from '~/contexts/QuoteContext';
import { QuoteRequestBody, QuoteResponse, FeeCommitment } from '~/types';
import { calculateRemainingTime } from '~/utils';

interface UseRequestQuoteParams {
  getQuote: (input: QuoteRequestBody) => Promise<QuoteResponse>;
  isQuoteLoading: boolean;
  quoteError: Error | null;

  chainId: number | undefined;
  amountBN: bigint;
  assetAddress: Address | undefined;
  recipient: Address | '';

  isValidAmount: boolean;
  isRecipientAddressValid: boolean;
  isRelayerSelected: boolean;

  addNotification: (type: 'error' | 'warning', message: string) => void;
}

interface UseRequestQuoteReturn {
  quoteCommitment: FeeCommitment | null;
  feeBPS: number | null;
  baseFeeBPS: number | null;
  extraGasAmountETH: string | null;
  isQuoteValid: boolean;
  countdown: number;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  isExpired: boolean;
  requestNewQuote: () => Promise<void>;
}

export const useRequestQuote = ({
  getQuote,
  isQuoteLoading,
  quoteError,
  chainId,
  amountBN,
  assetAddress,
  recipient,
  isValidAmount,
  isRecipientAddressValid,
  isRelayerSelected,
  addNotification,
}: UseRequestQuoteParams): UseRequestQuoteReturn => {
  const { quoteState, setQuoteData, updateCountdown, resetQuote, markAsExpired } = useQuoteContext();
  const isFetchingRef = useRef(false);
  const previousExtraGasRef = useRef(quoteState.extraGas);

  const canRequestQuote = useMemo(() => {
    return (
      isValidAmount &&
      recipient &&
      isRecipientAddressValid &&
      isRelayerSelected &&
      assetAddress &&
      chainId !== undefined &&
      amountBN > 0n
    );
  }, [isValidAmount, recipient, isRecipientAddressValid, isRelayerSelected, assetAddress, chainId, amountBN]);

  const executeFetchAndSetQuote = useCallback(async () => {
    if (!canRequestQuote || !chainId || !assetAddress || !recipient || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    try {
      const quoteInput = {
        chainId,
        amount: amountBN.toString(),
        asset: assetAddress,
        recipient,
        extraGas: quoteState.extraGas,
      };
      const newQuoteData = await getQuote(quoteInput);

      const remainingTime = calculateRemainingTime(newQuoteData.feeCommitment.expiration);
      setQuoteData(
        newQuoteData.feeCommitment,
        Number(newQuoteData.feeBPS),
        Number(newQuoteData.baseFeeBPS),
        newQuoteData.detail?.extraGasFundAmount?.eth || null,
        remainingTime,
      );
    } catch (err) {
      const errorMessage = `Failed to get quote: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('executeFetchAndSetQuote error:', err);
      addNotification('error', errorMessage);
      resetQuote();
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    canRequestQuote,
    chainId,
    amountBN,
    assetAddress,
    recipient,
    quoteState.extraGas,
    getQuote,
    addNotification,
    resetQuote,
    setQuoteData,
  ]);

  // Effect to fetch quote initially or when relevant inputs change
  useEffect(() => {
    if (canRequestQuote && !quoteState.quoteCommitment && !quoteState.isExpired) {
      executeFetchAndSetQuote();
    } else if (!canRequestQuote) {
      resetQuote();
    }
  }, [canRequestQuote, executeFetchAndSetQuote, resetQuote, quoteState.quoteCommitment, quoteState.isExpired]);

  // Effect to refetch quote when extraGas changes (only if we already have a quote)
  useEffect(() => {
    if (
      canRequestQuote &&
      quoteState.quoteCommitment &&
      !quoteState.isExpired &&
      previousExtraGasRef.current !== quoteState.extraGas
    ) {
      // Just refetch without resetting to avoid infinite loop
      executeFetchAndSetQuote();
      previousExtraGasRef.current = quoteState.extraGas;
    }
  }, [quoteState.extraGas, canRequestQuote, quoteState.quoteCommitment, quoteState.isExpired, executeFetchAndSetQuote]);

  // Effect to handle the countdown timer - NO auto-refetch on expiry
  useEffect(() => {
    let timerId: NodeJS.Timeout | undefined;

    if (quoteState.quoteCommitment && quoteState.countdown > 0 && !quoteState.isExpired) {
      timerId = setInterval(() => {
        updateCountdown(quoteState.countdown - 1);

        // When countdown reaches 0, just mark as expired - don't auto-refetch
        if (quoteState.countdown - 1 <= 0) {
          clearInterval(timerId);
          markAsExpired();
          addNotification('warning', 'Quote has expired. Please request a new quote.');
        }
      }, 1000);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [
    quoteState.quoteCommitment,
    quoteState.countdown,
    quoteState.isExpired,
    updateCountdown,
    markAsExpired,
    addNotification,
  ]);

  const isQuoteValid = useMemo(
    () => quoteState.quoteCommitment !== null && quoteState.countdown > 0 && !quoteState.isExpired,
    [quoteState.quoteCommitment, quoteState.countdown, quoteState.isExpired],
  );

  // Manual function to request a new quote (for use after expiry)
  const requestNewQuote = useCallback(async () => {
    isFetchingRef.current = false; // Reset the flag
    resetQuote();
    if (canRequestQuote) {
      await executeFetchAndSetQuote();
    }
  }, [canRequestQuote, executeFetchAndSetQuote, resetQuote]);

  return {
    quoteCommitment: quoteState.quoteCommitment,
    feeBPS: quoteState.feeBPS,
    baseFeeBPS: quoteState.baseFeeBPS,
    extraGasAmountETH: quoteState.extraGasAmountETH,
    isQuoteValid,
    countdown: quoteState.countdown,
    isQuoteLoading,
    quoteError,
    isExpired: quoteState.isExpired,
    requestNewQuote,
  };
};
