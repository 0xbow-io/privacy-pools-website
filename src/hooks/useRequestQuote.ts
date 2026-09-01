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
  relayerUrl: string | undefined;

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
  relayTxCostETH: string | null;
  isQuoteValid: boolean;
  countdown: number;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  isExpired: boolean;
  quotedAmount: string | null;
  canRequestQuote: boolean;
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
  relayerUrl,
  isValidAmount,
  isRecipientAddressValid,
  isRelayerSelected,
  addNotification,
}: UseRequestQuoteParams): UseRequestQuoteReturn => {
  const { quoteState, setQuoteData, updateCountdown, resetQuote, markAsExpired, setExtraGas } = useQuoteContext();
  const isFetchingRef = useRef(false);
  const previousExtraGasRef = useRef(quoteState.extraGas);
  const expiredNotificationSentRef = useRef<string | null>(null);
  const executeFetchAndSetQuoteRef = useRef<() => Promise<void>>(() => Promise.resolve());
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

  const canRequestQuote = useMemo((): boolean => {
    return (
      isValidAmount &&
      !!recipient &&
      isRecipientAddressValid &&
      isRelayerSelected &&
      !!relayerUrl &&
      !!assetAddress &&
      chainId !== undefined &&
      amountBN > 0n
    );
  }, [
    isValidAmount,
    recipient,
    isRecipientAddressValid,
    isRelayerSelected,
    relayerUrl,
    assetAddress,
    chainId,
    amountBN,
  ]);

  const executeFetchAndSetQuote = useCallback(async () => {
    if (!canRequestQuote || !chainId || !assetAddress || !recipient || !relayerUrl || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    const requestedAmount = amountBN.toString();
    try {
      const quoteInput = {
        chainId,
        amount: requestedAmount,
        asset: assetAddress,
        recipient,
        extraGas: quoteState.extraGas,
      };
      const newQuoteData = await getQuote(quoteInput);

      const remainingTime = calculateRemainingTime(newQuoteData.feeCommitment.expiration);

      if (remainingTime <= 0) {
        addNotification('warning', 'Quote expired immediately. Your system clock may be inaccurate.');
      }

      expiredNotificationSentRef.current = null;

      setQuoteData(
        newQuoteData.feeCommitment,
        Number(newQuoteData.feeBPS),
        Number(newQuoteData.baseFeeBPS),
        newQuoteData.detail?.extraGasFundAmount?.eth || null,
        newQuoteData.detail?.relayTxCost?.eth || null,
        remainingTime,
        requestedAmount,
        relayerUrl,
      );
    } catch (err) {
      // If extraGas was requested but the relayer doesn't support it for this chain,
      // automatically retry without extraGas
      if (quoteState.extraGas && err instanceof Error && err.message.includes('UNSUPPORTED_FEATURE')) {
        addNotification('warning', 'Extra gas is not available for this chain. Requesting quote without it.');
        setExtraGas(false);
        previousExtraGasRef.current = false;
        try {
          const retryInput = {
            chainId,
            amount: requestedAmount,
            asset: assetAddress,
            recipient,
            extraGas: false,
          };
          const retryData = await getQuote(retryInput);
          const remainingTime = calculateRemainingTime(retryData.feeCommitment.expiration);
          expiredNotificationSentRef.current = null;
          setQuoteData(
            retryData.feeCommitment,
            Number(retryData.feeBPS),
            Number(retryData.baseFeeBPS),
            retryData.detail?.extraGasFundAmount?.eth || null,
            retryData.detail?.relayTxCost?.eth || null,
            remainingTime,
            requestedAmount,
            relayerUrl,
          );
          return;
        } catch (retryErr) {
          const retryMessage = `Failed to get quote: ${retryErr instanceof Error ? retryErr.message : 'Unknown error'}`;
          console.error('executeFetchAndSetQuote retry error:', retryErr);
          addNotification('error', retryMessage);
          resetQuote();
          return;
        }
      }

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
    relayerUrl,
    quoteState.extraGas,
    getQuote,
    addNotification,
    resetQuote,
    setQuoteData,
    setExtraGas,
  ]);

  // Keep ref updated with latest function
  useEffect(() => {
    executeFetchAndSetQuoteRef.current = executeFetchAndSetQuote;
  }, [executeFetchAndSetQuote]);

  // Reset quote when form becomes invalid
  useEffect(() => {
    if (!canRequestQuote) {
      resetQuote();
    }
  }, [canRequestQuote, resetQuote]);

  // Effect to refetch quote when extraGas changes (only if we already have a quote)
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

  // effect to handle the countdown timer
  useEffect(() => {
    const currentQuoteId = quoteState.quoteCommitment?.signedRelayerCommitment || null;

    if (
      quoteState.quoteCommitment &&
      quoteState.countdown > 0 &&
      !quoteState.isExpired &&
      quoteState.quotedRelayerUrl === relayerUrl &&
      currentQuoteId &&
      currentQuoteId !== currentQuoteIdRef.current &&
      !globalTimerInstanceActive
    ) {
      startTimer(currentQuoteId, quoteState.countdown);
    }

    if (!quoteState.quoteCommitment || quoteState.quotedRelayerUrl !== relayerUrl) {
      stopTimer();
    }

    return stopTimer;
  }, [
    quoteState.quoteCommitment?.signedRelayerCommitment,
    quoteState.isExpired,
    quoteState.quotedRelayerUrl,
    relayerUrl,
  ]);

  const isQuoteValid = useMemo(
    () =>
      quoteState.quoteCommitment !== null &&
      quoteState.countdown > 0 &&
      !quoteState.isExpired &&
      quoteState.quotedRelayerUrl === relayerUrl,
    [quoteState.quoteCommitment, quoteState.countdown, quoteState.isExpired, quoteState.quotedRelayerUrl, relayerUrl],
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
    relayTxCostETH: quoteState.relayTxCostETH,
    isQuoteValid,
    countdown: quoteState.countdown,
    isQuoteLoading,
    quoteError,
    isExpired: quoteState.isExpired,
    quotedAmount: quoteState.quotedAmount,
    canRequestQuote,
    requestNewQuote,
  };
};
