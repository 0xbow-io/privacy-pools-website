'use client';

import { useMemo } from 'react';
import { useASP, useRelayer, useChainContext } from '~/hooks';

export const useExternalServices = () => {
  const {
    chainId,
    selectedRelayer,
    chain: { aspUrl, brevisAspUrl },
    selectedPoolInfo,
    relayersData,
  } = useChainContext();

  const currentSelectedRelayerData = useMemo(() => {
    return relayersData.find((r) => r.url === selectedRelayer?.url);
  }, [relayersData, selectedRelayer]);

  const relayerData = useRelayer();

  const aspData = useASP(chainId, selectedPoolInfo.scope.toString(), aspUrl, brevisAspUrl);

  const isLoading = aspData.isLoading || relayerData.isQuoteLoading;

  return {
    aspData,
    relayerData,
    currentSelectedRelayerData,
    isLoading,
  };
};
