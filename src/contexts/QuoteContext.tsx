'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FeeCommitment } from '~/types';

interface QuoteState {
  quoteCommitment: FeeCommitment | null;
  feeBPS: number | null;
  countdown: number;
  isExpired: boolean;
}

interface QuoteContextType {
  quoteState: QuoteState;
  setQuoteData: (commitment: FeeCommitment, feeBPS: number, countdown: number) => void;
  updateCountdown: (countdown: number) => void;
  resetQuote: () => void;
  markAsExpired: () => void;
}

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quoteState, setQuoteState] = useState<QuoteState>({
    quoteCommitment: null,
    feeBPS: null,
    countdown: 0,
    isExpired: false,
  });

  const setQuoteData = useCallback((commitment: FeeCommitment, feeBPS: number, countdown: number) => {
    setQuoteState({
      quoteCommitment: commitment,
      feeBPS,
      countdown,
      isExpired: false,
    });
  }, []);

  const updateCountdown = useCallback((countdown: number) => {
    setQuoteState((prev) => ({
      ...prev,
      countdown,
      isExpired: countdown <= 0 && prev.quoteCommitment !== null,
    }));
  }, []);

  const resetQuote = useCallback(() => {
    setQuoteState({
      quoteCommitment: null,
      feeBPS: null,
      countdown: 0,
      isExpired: false,
    });
  }, []);

  const markAsExpired = useCallback(() => {
    setQuoteState((prev) => ({
      ...prev,
      isExpired: true,
      countdown: 0,
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
