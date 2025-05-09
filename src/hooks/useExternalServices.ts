'use client';

import { useASP, useRelayer, useChainContext } from '~/hooks';

export const useExternalServices = () => {
  const {
    chainId,
    selectedRelayer,
    chain: { poolInfo, aspUrl },
  } = useChainContext();
  const aspData = useASP(chainId, poolInfo.scope.toString(), aspUrl);
  const relayerData = useRelayer(selectedRelayer.url, chainId);

  const isLoading = !!aspData.isLoading || !!relayerData.isLoading;

  return {
    aspData,
    relayerData,
    isLoading,
  };
};
