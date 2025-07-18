'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FeeCommitment } from '~/types';

interface QuoteState {
  quoteCommitment: FeeCommitment | null;
  feeBPS: number | null;
  baseFeeBPS: number | null;
  extraGasAmountETH: string | null;
  countdown: number;
  isExpired: boolean;
  extraGas: boolean;
}

interface QuoteContextType {
  quoteState: QuoteState;
  setQuoteData: (
    commitment: FeeCommitment,
    feeBPS: number,
    baseFeeBPS: number,
    extraGasAmountETH: string | null,
    countdown: number,
  ) => void;
  updateCountdown: (countdown: number) => void;
  resetQuote: () => void;
  markAsExpired: () => void;
  setExtraGas: (extraGas: boolean) => void;
}

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quoteState, setQuoteState] = useState<QuoteState>({
    quoteCommitment: null,
    feeBPS: null,
    baseFeeBPS: null,
    extraGasAmountETH: null,
    countdown: 0,
    isExpired: false,
    extraGas: false,
  });

  const setQuoteData = useCallback(
    (
      commitment: FeeCommitment,
      feeBPS: number,
      baseFeeBPS: number,
      extraGasAmountETH: string | null,
      countdown: number,
    ) => {
      setQuoteState((prev) => ({
        quoteCommitment: commitment,
        feeBPS,
        baseFeeBPS,
        extraGasAmountETH,
        countdown,
        isExpired: false,
        extraGas: prev.extraGas, // Preserve current extraGas setting
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
      countdown: 0,
      isExpired: false,
      extraGas: prev.extraGas, // Preserve extraGas setting when resetting quote
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

  return (
    <QuoteContext.Provider
      value={{
        quoteState,
        setQuoteData,
        updateCountdown,
        resetQuote,
        markAsExpired,
        setExtraGas,
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
