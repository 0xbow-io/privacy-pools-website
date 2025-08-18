'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const useFeatureFlag = (flagName: string): boolean => {
  const searchParams = useSearchParams();
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    const flagValue = searchParams.get(flagName);
    setIsEnabled(flagValue === '1' || flagValue === 'true');
  }, [searchParams, flagName]);

  return isEnabled;
};

export const useStakingFeature = (): boolean => {
  return useFeatureFlag('enable_staking');
};
