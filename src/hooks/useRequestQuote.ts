'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Address } from 'viem';
import { useQuoteContext } from '~/contexts/QuoteContext';
import { QuoteRequestBody, QuoteResponse, FeeCommitment } from '~/types';
import { calculateRemainingTime } from '~/utils';

let globalTimerInstanceActive = false;

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
  const expiredNotificationSentRef = useRef<string | null>(null);
  const timerIdRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const currentQuoteIdRef = useRef<string | null>(null);

  const updateCountdownRef = useRef(updateCountdown);
  const markAsExpiredRef = useRef(markAsExpired);
  const addNotificationRef = useRef(addNotification);

  useEffect(() => {
    updateCountdownRef.current = updateCountdown;
    markAsExpiredRef.current = markAsExpired;
    addNotificationRef.current = addNotification;
  }, [updateCountdown, markAsExpired, addNotification]);

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

      expiredNotificationSentRef.current = null;

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

  useEffect(() => {
    if (canRequestQuote && !quoteState.quoteCommitment && !quoteState.isExpired) {
      executeFetchAndSetQuote();
    } else if (!canRequestQuote) {
      resetQuote();
    }
  }, [canRequestQuote, executeFetchAndSetQuote, resetQuote, quoteState.quoteCommitment, quoteState.isExpired]);

  useEffect(() => {
    if (
      canRequestQuote &&
      quoteState.quoteCommitment &&
      !quoteState.isExpired &&
      previousExtraGasRef.current !== quoteState.extraGas
    ) {
      executeFetchAndSetQuote();
      previousExtraGasRef.current = quoteState.extraGas;
    }
  }, [quoteState.extraGas, canRequestQuote, quoteState.quoteCommitment, quoteState.isExpired, executeFetchAndSetQuote]);

  const startTimer = useCallback((quoteId: string, initialCountdown: number) => {
    if (timerIdRef.current || globalTimerInstanceActive) {
      return;
    }

    globalTimerInstanceActive = true;
    currentQuoteIdRef.current = quoteId;
    let currentCountdown = initialCountdown;

    timerIdRef.current = setInterval(() => {
      currentCountdown -= 1;
      updateCountdownRef.current(currentCountdown);

      if (currentCountdown <= 0) {
        if (timerIdRef.current) {
          clearInterval(timerIdRef.current);
          timerIdRef.current = undefined;
        }
        globalTimerInstanceActive = false;

        const alreadyNotified = expiredNotificationSentRef.current === quoteId;

        if (quoteId && !alreadyNotified) {
          expiredNotificationSentRef.current = quoteId;
          markAsExpiredRef.current();
          addNotificationRef.current('warning', 'Quote has expired. Please request a new quote.');
        }

        currentQuoteIdRef.current = null;
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = undefined;
    }
    globalTimerInstanceActive = false;
    currentQuoteIdRef.current = null;
  }, []);

  useEffect(() => {
    const currentQuoteId = quoteState.quoteCommitment?.signedRelayerCommitment || null;

    if (
      quoteState.quoteCommitment &&
      quoteState.countdown > 0 &&
      !quoteState.isExpired &&
      currentQuoteId &&
      currentQuoteId !== currentQuoteIdRef.current &&
      !globalTimerInstanceActive
    ) {
      startTimer(currentQuoteId, quoteState.countdown);
    }

    if (!quoteState.quoteCommitment) {
      stopTimer();
    }

    return stopTimer;
  }, [quoteState.quoteCommitment?.signedRelayerCommitment, quoteState.isExpired]);

  const isQuoteValid = useMemo(
    () => quoteState.quoteCommitment !== null && quoteState.countdown > 0 && !quoteState.isExpired,
    [quoteState.quoteCommitment, quoteState.countdown, quoteState.isExpired],
  );

  const requestNewQuote = useCallback(async () => {
    isFetchingRef.current = false;
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
