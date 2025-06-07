'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Address } from 'viem';
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
  const [quoteCommitment, setQuoteCommitment] = useState<FeeCommitment | null>(null);
  const [feeBPS, setFeeBPS] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const resetQuoteState = useCallback(() => {
    setQuoteCommitment(null);
    setFeeBPS(null);
    setCountdown(0);
  }, []);

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
    if (!canRequestQuote || !chainId || !assetAddress || !recipient) {
      resetQuoteState();
      return;
    }

    try {
      resetQuoteState();

      const quoteInput = { chainId, amount: amountBN.toString(), asset: assetAddress, recipient };
      const newQuoteData = await getQuote(quoteInput);

      setQuoteCommitment(newQuoteData.feeCommitment);
      setFeeBPS(Number(newQuoteData.feeBPS));
      setCountdown(calculateRemainingTime(newQuoteData.feeCommitment.expiration));
    } catch (err) {
      const errorMessage = `Failed to get quote: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('executeFetchAndSetQuote error:', err);
      addNotification('error', errorMessage);
      resetQuoteState();
    }
  }, [canRequestQuote, chainId, amountBN, assetAddress, recipient, getQuote, addNotification, resetQuoteState]);

  // Effect to fetch quote initially or when relevant inputs change
  useEffect(() => {
    resetQuoteState();

    if (canRequestQuote) {
      executeFetchAndSetQuote();
    }
  }, [canRequestQuote, executeFetchAndSetQuote, resetQuoteState]);

  // Effect to handle the countdown timer and refetch on expiry
  useEffect(() => {
    let timerId: NodeJS.Timeout | undefined;

    if (quoteCommitment && countdown > 0) {
      timerId = setInterval(() => {
        setCountdown((prevCountdown) => {
          const newCountdown = prevCountdown - 1;
          if (newCountdown <= 0) {
            clearInterval(timerId);
            if (canRequestQuote) {
              executeFetchAndSetQuote();
            } else {
              console.log('Quote expired, but inputs are no longer valid. Clearing.');
              resetQuoteState();
            }
            return 0;
          }
          return newCountdown;
        });
      }, 1000);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [quoteCommitment, countdown, canRequestQuote, executeFetchAndSetQuote, resetQuoteState]);

  const isQuoteValid = useMemo(() => quoteCommitment !== null && countdown > 0, [quoteCommitment, countdown]);

  return {
    quoteCommitment,
    feeBPS,
    isQuoteValid,
    countdown,
    isQuoteLoading,
    quoteError,
  };
};
