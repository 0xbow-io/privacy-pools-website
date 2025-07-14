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
      const quoteInput = { chainId, amount: amountBN.toString(), asset: assetAddress, recipient };
      const newQuoteData = await getQuote(quoteInput);

      console.log('🔍 Quote response debug:', {
        expiration: newQuoteData.feeCommitment.expiration,
        currentTime: Date.now(),
        expirationDate: new Date(newQuoteData.feeCommitment.expiration),
        currentDate: new Date(),
        timeDiff: newQuoteData.feeCommitment.expiration - Date.now(),
        fullQuoteData: newQuoteData,
      });

      const remainingTime = calculateRemainingTime(newQuoteData.feeCommitment.expiration);
      console.log('⏰ Calculated remaining time:', remainingTime, 'seconds');

      setQuoteData(newQuoteData.feeCommitment, Number(newQuoteData.feeBPS), remainingTime);
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
    getQuote,
    addNotification,
    resetQuote,
    setQuoteData,
  ]);

  // Effect to fetch quote initially or when relevant inputs change
  useEffect(() => {
    console.log('useRequestQuote effect triggered:', {
      canRequestQuote,
      hasQuoteCommitment: !!quoteState.quoteCommitment,
      isExpired: quoteState.isExpired,
      isFetching: isFetchingRef.current,
    });

    if (canRequestQuote && !quoteState.quoteCommitment && !quoteState.isExpired) {
      console.log('Executing quote fetch...');
      executeFetchAndSetQuote();
    } else if (!canRequestQuote) {
      console.log('Resetting quote due to invalid request conditions...');
      resetQuote();
    }
  }, [canRequestQuote, executeFetchAndSetQuote, resetQuote, quoteState.quoteCommitment, quoteState.isExpired]);

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
    isQuoteValid,
    countdown: quoteState.countdown,
    isQuoteLoading,
    quoteError,
    isExpired: quoteState.isExpired,
    requestNewQuote,
  };
};
