'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Address } from 'viem';
import { useQuoteContext } from '~/contexts/QuoteContext';
import { QuoteRequestBody, QuoteResponse, FeeCommitment } from '~/types';
import { calculateRemainingTime } from '~/utils';
import { CommitOutcome, fetchCommitQuote, fetchPriceWithFallback, QuotePriceParams } from '~/utils/quotePhases';

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
  /** A price is stored for the current amount and relayer (phase 1 done). */
  isPriceCurrent: boolean;
  /** A signed commitment is stored and still within its clock (phase 2 done). */
  isQuoteValid: boolean;
  countdown: number;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  isExpired: boolean;
  quotedAmount: string | null;
  canRequestQuote: boolean;
  canCommitQuote: boolean;
  requestNewQuote: () => Promise<void>;
  commitQuote: () => Promise<CommitOutcome>;
}

// Two requests to the relayer's /quote endpoint:
//  - phase 1, when the review step opens: chain, asset, amount, extraGas and
//    no recipient. The relayer returns the price (feeBPS + gas detail) and
//    signs nothing, so no clock runs while the user reads the screen.
//  - phase 2, on Confirm: the same fields plus the recipient. The relayer
//    signs the fee commitment and its 60 s clock starts here, right before
//    proving. The recipient is only sent once the user has decided to go
//    ahead.
// A relayer that rejects the phase-1 body without a recipient gets the
// recipient in phase 1 after all (see fetchPriceWithFallback); for it the
// request at review time is the one made before the split, and only the
// clock moves to Confirm.
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
  const { quoteState, setPriceData, setQuoteData, updateCountdown, resetQuote, markAsExpired, setExtraGas } =
    useQuoteContext();
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

  // Phase 1 prerequisites: everything the price depends on. No recipient.
  const canRequestQuote = useMemo((): boolean => {
    return (
      isValidAmount && isRelayerSelected && !!relayerUrl && !!assetAddress && chainId !== undefined && amountBN > 0n
    );
  }, [isValidAmount, isRelayerSelected, relayerUrl, assetAddress, chainId, amountBN]);

  // Phase 2 prerequisites: the price prerequisites plus a valid recipient.
  const canCommitQuote = useMemo(
    (): boolean => canRequestQuote && !!recipient && isRecipientAddressValid,
    [canRequestQuote, recipient, isRecipientAddressValid],
  );

  const executeFetchAndSetQuote = useCallback(async () => {
    if (!canRequestQuote || !chainId || !assetAddress || !relayerUrl || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    const requestedAmount = amountBN.toString();
    const params: QuotePriceParams = {
      chainId,
      amount: requestedAmount,
      asset: assetAddress,
      extraGas: quoteState.extraGas,
    };
    // Only for the fallback: a relayer that rejects a body without a recipient
    // gets it at this step, as before the split.
    const fallbackRecipient = canCommitQuote && recipient ? recipient : null;
    try {
      const { price } = await fetchPriceWithFallback(getQuote, params, fallbackRecipient, relayerUrl);
      expiredNotificationSentRef.current = null;
      setPriceData(price, requestedAmount, relayerUrl);
    } catch (err) {
      // If extraGas was requested but the relayer doesn't support it for this chain,
      // automatically retry without extraGas
      if (quoteState.extraGas && err instanceof Error && err.message.includes('UNSUPPORTED_FEATURE')) {
        addNotification('warning', 'Extra gas is not available for this chain. Requesting quote without it.');
        setExtraGas(false);
        previousExtraGasRef.current = false;
        try {
          const { price } = await fetchPriceWithFallback(
            getQuote,
            { ...params, extraGas: false },
            fallbackRecipient,
            relayerUrl,
          );
          expiredNotificationSentRef.current = null;
          setPriceData(price, requestedAmount, relayerUrl);
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
    canCommitQuote,
    chainId,
    amountBN,
    assetAddress,
    recipient,
    relayerUrl,
    quoteState.extraGas,
    getQuote,
    addNotification,
    resetQuote,
    setPriceData,
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

  // Effect to refetch the price when extraGas changes (only if we already have one)
  useEffect(() => {
    if (canRequestQuote && quoteState.feeBPS !== null && previousExtraGasRef.current !== quoteState.extraGas) {
      executeFetchAndSetQuote();
      previousExtraGasRef.current = quoteState.extraGas;
    }
  }, [quoteState.extraGas, canRequestQuote, quoteState.feeBPS, executeFetchAndSetQuote]);

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

  const isPriceCurrent = useMemo(
    () =>
      quoteState.feeBPS !== null &&
      quoteState.quotedRelayerUrl === relayerUrl &&
      quoteState.quotedAmount === amountBN.toString(),
    [quoteState.feeBPS, quoteState.quotedRelayerUrl, quoteState.quotedAmount, relayerUrl, amountBN],
  );

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

  // Phase 2. Sends the recipient to the relayer that produced the shown price
  // (same relayerUrl) and stores the signed commitment. If the relayer's fee
  // is now above the shown one, nothing is stored but the new price, and the
  // caller asks the user to confirm again. Throws on a relayer error.
  const commitQuote = useCallback(async (): Promise<CommitOutcome> => {
    if (!canCommitQuote || !chainId || !assetAddress || !recipient || !relayerUrl) {
      throw new Error('Missing withdrawal details for the fee commitment');
    }
    if (quoteState.feeBPS === null || !isPriceCurrent) {
      throw new Error('No fee shown for this amount and relayer');
    }

    const requestedAmount = amountBN.toString();
    const params: QuotePriceParams = {
      chainId,
      amount: requestedAmount,
      asset: assetAddress,
      extraGas: quoteState.extraGas,
    };

    const outcome = await fetchCommitQuote(getQuote, params, recipient, quoteState.feeBPS);

    if (outcome.kind === 'fee-increased') {
      setPriceData(outcome.price, requestedAmount, relayerUrl);
      return outcome;
    }

    const remainingTime = calculateRemainingTime(outcome.feeCommitment.expiration);
    if (remainingTime <= 0) {
      addNotification('warning', 'Quote expired immediately. Your system clock may be inaccurate.');
    }
    expiredNotificationSentRef.current = null;
    setQuoteData(outcome.feeCommitment, outcome.price, remainingTime, requestedAmount, relayerUrl);
    return outcome;
  }, [
    canCommitQuote,
    chainId,
    assetAddress,
    recipient,
    relayerUrl,
    amountBN,
    quoteState.feeBPS,
    quoteState.extraGas,
    isPriceCurrent,
    getQuote,
    setPriceData,
    setQuoteData,
    addNotification,
  ]);

  return {
    quoteCommitment: quoteState.quoteCommitment,
    feeBPS: quoteState.feeBPS,
    baseFeeBPS: quoteState.baseFeeBPS,
    extraGasAmountETH: quoteState.extraGasAmountETH,
    relayTxCostETH: quoteState.relayTxCostETH,
    isPriceCurrent,
    isQuoteValid,
    countdown: quoteState.countdown,
    isQuoteLoading,
    quoteError,
    isExpired: quoteState.isExpired,
    quotedAmount: quoteState.quotedAmount,
    canRequestQuote,
    canCommitQuote,
    requestNewQuote,
    commitQuote,
  };
};
