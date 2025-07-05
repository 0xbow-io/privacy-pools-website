'use client';

import { useCallback, useEffect, useState } from 'react';

interface CircuitPreloadState {
  isPreloaded: boolean;
  isPreloading: boolean;
  error: string | null;
  progress: number;
}

export const useCircuitPreloader = () => {
  const [state, setState] = useState<CircuitPreloadState>({
    isPreloaded: false,
    isPreloading: false,
    error: null,
    progress: 0,
  });

  const preloadCircuits = useCallback(async () => {
    if (state.isPreloaded || state.isPreloading) return;

    setState((prev) => ({ ...prev, isPreloading: true, error: null, progress: 0 }));

    try {
      // Lazy load SDK to trigger circuit initialization
      setState((prev) => ({ ...prev, progress: 0.3 }));

      await import('~/utils/sdk');

      setState((prev) => ({ ...prev, progress: 0.6 }));

      // Trigger circuit initialization by accessing SDK functions
      // This will cause the Circuits constructor to be called
      await Promise.resolve(); // Small delay to show progress

      setState((prev) => ({ ...prev, progress: 1, isPreloaded: true, isPreloading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to preload circuits',
        isPreloading: false,
      }));
    }
  }, [state.isPreloaded, state.isPreloading]);

  // Auto-preload on component mount with a small delay to not block initial render
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadCircuits();
    }, 2000); // 2 second delay to allow initial page load

    return () => clearTimeout(timer);
  }, [preloadCircuits]);

  return {
    ...state,
    preloadCircuits,
  };
};
