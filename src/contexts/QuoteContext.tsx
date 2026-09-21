'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FeeCommitment } from '~/types';
import { PriceQuote } from '~/utils/quotePhases';

interface QuoteState {
  // Phase 2 only: the signed commitment obtained on Confirm, and its clock.
  quoteCommitment: FeeCommitment | null;
  countdown: number;
  isExpired: boolean;
  // Phase 1: the price shown on the review step. No clock runs on it.
  feeBPS: number | null;
  baseFeeBPS: number | null;
  extraGasAmountETH: string | null;
  relayTxCostETH: string | null;
  extraGas: boolean;
  quotedAmount: string | null; // The amount used when the price was requested
  quotedRelayerUrl: string | null; // The relayer that produced the price
  pendingQuoteRequest: boolean; // Flag to trigger the price request when Review screen opens
}

interface QuoteContextType {
  quoteState: QuoteState;
  setPriceData: (price: PriceQuote, quotedAmount: string, quotedRelayerUrl: string) => void;
  setQuoteData: (
    commitment: FeeCommitment,
    price: PriceQuote,
    countdown: number,
    quotedAmount: string,
    quotedRelayerUrl: string,
  ) => void;
  updateCountdown: (countdown: number) => void;
  resetQuote: () => void;
  clearCommitment: () => void;
  markAsExpired: () => void;
  setExtraGas: (extraGas: boolean) => void;
  requestQuote: () => void;
  clearPendingQuoteRequest: () => void;
}

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quoteState, setQuoteState] = useState<QuoteState>({
    quoteCommitment: null,
    feeBPS: null,
    baseFeeBPS: null,
    extraGasAmountETH: null,
    relayTxCostETH: null,
    countdown: 0,
    isExpired: false,
    extraGas: false,
    quotedAmount: null,
    quotedRelayerUrl: null,
    pendingQuoteRequest: false,
  });

  // Phase 1: store the price; any earlier commitment no longer matches it.
  const setPriceData = useCallback((price: PriceQuote, quotedAmount: string, quotedRelayerUrl: string) => {
    setQuoteState((prev) => ({
      quoteCommitment: null,
      feeBPS: price.feeBPS,
      baseFeeBPS: price.baseFeeBPS,
      extraGasAmountETH: price.extraGasAmountETH,
      relayTxCostETH: price.relayTxCostETH,
      countdown: 0,
      isExpired: false,
      extraGas: prev.extraGas, // Preserve current extraGas setting
      quotedAmount,
      quotedRelayerUrl,
      pendingQuoteRequest: false, // Clear pending request when the price is set
    }));
  }, []);

  // Phase 2: store the commitment together with the price it was signed for.
  const setQuoteData = useCallback(
    (
      commitment: FeeCommitment,
      price: PriceQuote,
      countdown: number,
      quotedAmount: string,
      quotedRelayerUrl: string,
    ) => {
      setQuoteState((prev) => ({
        quoteCommitment: commitment,
        feeBPS: price.feeBPS,
        baseFeeBPS: price.baseFeeBPS,
        extraGasAmountETH: price.extraGasAmountETH,
        relayTxCostETH: price.relayTxCostETH,
        countdown,
        isExpired: countdown <= 0, // Mark as expired immediately if countdown is already 0 (e.g., clock skew)
        extraGas: prev.extraGas, // Preserve current extraGas setting
        quotedAmount,
        quotedRelayerUrl,
        pendingQuoteRequest: false,
      }));
    },
    [],
  );

  const updateCountdown = useCallback((countdown: number) => {
    setQuoteState((prev) => ({
      ...prev,
      countdown,
      isExpired: countdown <= 0 && prev.quoteCommitment !== null,
    }));
  }, []);

  const resetQuote = useCallback(() => {
    setQuoteState((prev) => ({
      quoteCommitment: null,
      feeBPS: null,
      baseFeeBPS: null,
      extraGasAmountETH: null,
      relayTxCostETH: null,
      countdown: 0,
      isExpired: false,
      extraGas: prev.extraGas, // Preserve extraGas setting when resetting quote
      quotedAmount: null,
      quotedRelayerUrl: null,
      pendingQuoteRequest: prev.pendingQuoteRequest, // Preserve pending request state
    }));
  }, []);

  // Drop a commitment (and its clock) while keeping the price on screen.
  const clearCommitment = useCallback(() => {
    setQuoteState((prev) =>
      prev.quoteCommitment === null && !prev.isExpired && prev.countdown === 0
        ? prev
        : { ...prev, quoteCommitment: null, countdown: 0, isExpired: false },
    );
  }, []);

  const markAsExpired = useCallback(() => {
    setQuoteState((prev) => ({
      ...prev,
      isExpired: true,
      countdown: 0,
    }));
  }, []);

  const setExtraGas = useCallback((extraGas: boolean) => {
    setQuoteState((prev) => ({
      ...prev,
      extraGas,
    }));
  }, []);

  const requestQuote = useCallback(() => {
    setQuoteState((prev) => ({
      ...prev,
      pendingQuoteRequest: true,
    }));
  }, []);

  const clearPendingQuoteRequest = useCallback(() => {
    setQuoteState((prev) => ({
      ...prev,
      pendingQuoteRequest: false,
    }));
  }, []);

  return (
    <QuoteContext.Provider
      value={{
        quoteState,
        setPriceData,
        setQuoteData,
        updateCountdown,
        resetQuote,
        clearCommitment,
        markAsExpired,
        setExtraGas,
        requestQuote,
        clearPendingQuoteRequest,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuoteContext() {
  const context = useContext(QuoteContext);
  if (context === undefined) {
    throw new Error('useQuoteContext must be used within a QuoteProvider');
  }
  return context;
}
