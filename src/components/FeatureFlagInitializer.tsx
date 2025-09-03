'use client';

import { useStakingFeature } from '~/hooks';

/**
 * FeatureFlagInitializer ensures that feature flags are checked and initialized
 * immediately when the app loads, before any user authentication or redirects happen.
 * This prevents URL parameters like ?enable_staking=1 from being lost during auth flows.
 */
export const FeatureFlagInitializer = () => {
  useStakingFeature();
  return null;
};
