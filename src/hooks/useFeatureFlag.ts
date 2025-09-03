'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const FEATURE_FLAG_PREFIX = 'feature_flag_';

export const useFeatureFlag = (flagName: string): boolean => {
  const searchParams = useSearchParams();
  const [isEnabled, setIsEnabled] = useState(() => {
    // Initialize with localStorage value on client side only
    if (typeof window === 'undefined') return false;

    try {
      const storageKey = `${FEATURE_FLAG_PREFIX}${flagName}`;
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const storageKey = `${FEATURE_FLAG_PREFIX}${flagName}`;

    try {
      // Check URL params first
      const flagValue = searchParams.get(flagName);

      if (flagValue !== null) {
        // URL param is present, update localStorage based on its value
        if (flagValue === '1' || flagValue === 'true') {
          // Enable the feature flag
          localStorage.setItem(storageKey, 'true');
          setIsEnabled(true);
        } else if (flagValue === '0' || flagValue === 'false') {
          // Explicitly disable and remove from localStorage
          localStorage.removeItem(storageKey);
          setIsEnabled(false);
        }
      } else {
        // No URL param, check localStorage
        const storedValue = localStorage.getItem(storageKey);
        setIsEnabled(storedValue === 'true');
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }, [searchParams, flagName]);

  return isEnabled;
};

export const useStakingFeature = (): boolean => {
  return useFeatureFlag('enable_staking');
};
