'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FeeCommitment } from '~/types';

interface QuoteState {
  quoteCommitment: FeeCommitment | null;
  feeBPS: number | null;
  baseFeeBPS: number | null;
  extraGasAmountETH: string | null;
  relayTxCostETH: string | null;
  countdown: number;
  isExpired: boolean;
  extraGas: boolean;
  quotedAmount: string | null; // The amount used when the quote was requested
  quotedRelayerUrl: string | null; // The relayer that produced the quote
  pendingQuoteRequest: boolean; // Flag to trigger quote request when Review screen opens
}

interface QuoteContextType {
  quoteState: QuoteState;
  setQuoteData: (
    commitment: FeeCommitment,
    feeBPS: number,
    baseFeeBPS: number,
    extraGasAmountETH: string | null,
    relayTxCostETH: string | null,
    countdown: number,
    quotedAmount: string,
    quotedRelayerUrl: string,
  ) => void;
  updateCountdown: (countdown: number) => void;
  resetQuote: () => void;
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

  const setQuoteData = useCallback(
    (
      commitment: FeeCommitment,
      feeBPS: number,
      baseFeeBPS: number,
      extraGasAmountETH: string | null,
      relayTxCostETH: string | null,
      countdown: number,
      quotedAmount: string,
      quotedRelayerUrl: string,
    ) => {
      setQuoteState((prev) => ({
        quoteCommitment: commitment,
        feeBPS,
        baseFeeBPS,
        extraGasAmountETH,
        relayTxCostETH,
        countdown,
        isExpired: countdown <= 0, // Mark as expired immediately if countdown is already 0 (e.g., clock skew)
        extraGas: prev.extraGas, // Preserve current extraGas setting
        quotedAmount,
        quotedRelayerUrl,
        pendingQuoteRequest: false, // Clear pending request when quote is set
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
        setQuoteData,
        updateCountdown,
        resetQuote,
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
