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
    if (typeof window === 'undefined') return;

    const storageKey = `${FEATURE_FLAG_PREFIX}${flagName}`;
    const urlParam = searchParams?.get(flagName) || new URLSearchParams(window.location.search).get(flagName);

    if (urlParam !== null) {
      if (urlParam === '1' || urlParam === 'true') {
        localStorage.setItem(storageKey, 'true');
        setIsEnabled(true);
      } else if (urlParam === '0' || urlParam === 'false') {
        localStorage.removeItem(storageKey);
        setIsEnabled(false);
      }
    } else {
      const storedValue = localStorage.getItem(storageKey);
      setIsEnabled(storedValue === 'true');
    }
  }, [flagName, searchParams]);

  return isEnabled;
};

export const useStakingFeature = (): boolean => {
  return useFeatureFlag('enable_staking');
};
