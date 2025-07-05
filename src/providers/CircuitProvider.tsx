'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useCircuitPreloader } from '~/hooks/useCircuitPreloader';

interface CircuitContextType {
  isPreloaded: boolean;
  isPreloading: boolean;
  error: string | null;
  progress: number;
  preloadCircuits: () => Promise<void>;
}

const CircuitContext = createContext<CircuitContextType | undefined>(undefined);

export const useCircuitContext = () => {
  const context = useContext(CircuitContext);
  if (!context) {
    throw new Error('useCircuitContext must be used within a CircuitProvider');
  }
  return context;
};

type Props = {
  children: ReactNode;
};

export const CircuitProvider = ({ children }: Props) => {
  const circuitState = useCircuitPreloader();

  return <CircuitContext.Provider value={circuitState}>{children}</CircuitContext.Provider>;
};
