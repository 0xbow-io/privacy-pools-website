'use client';

import { createContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { parseEther } from 'viem';
import { useAccount, useBalance } from 'wagmi';
import { ChainData, chainData, ChainAssets, whitelistedChains, PoolInfo, getConfig } from '~/config';
import { useNotifications } from '~/hooks';
import { fetchTokenPrice, relayerClient } from '~/utils';

type RelayerDataType = {
  name: string;
  url: string;
  fees?: string;
  relayerAddress?: string;
  isSelectable: boolean;
};

type SelectedRelayerType = {
  name: string;
  url: string;
};

type ContextType = {
  chain: ChainData[number];
  chainId: number;
  balanceBN: { value: bigint; symbol: string; formatted: string; decimals: number };
  balanceInPoolBN: string;
  setChainId: (value: number) => void;
  setBalanceInPool: (val: string) => void;
  price: number;
  maxDeposit: string;
  selectedRelayer: SelectedRelayerType | undefined;
  setSelectedRelayer: (value: SelectedRelayerType | undefined) => void;
  relayers: { name: string; url: string }[];
  relayersData: RelayerDataType[];
  isLoadingRelayers: boolean;
  hasSomeRelayerAvailable: boolean;
  selectedAsset: ChainAssets;
  setSelectedAsset: (value: ChainAssets) => void;
  selectedPoolInfo: PoolInfo;
};

interface Props {
  children: React.ReactNode;
}
const {
  constants: { DEFAULT_ASSET },
} = getConfig();

export const ChainContext = createContext({} as ContextType);

export const ChainProvider = ({ children }: Props) => {
  const { address } = useAccount();
  const [chainId, setChainId] = useState(whitelistedChains[0].id);
  const { addNotification } = useNotifications();
  const [balanceInPoolBN, setBalanceInPool] = useState<string>(parseEther('100').toString());
  const [price, setPrice] = useState<number>(0);
  const [selectedAsset, setSelectedAsset] = useState<ChainAssets>(DEFAULT_ASSET);
  const [selectedRelayer, setSelectedRelayer] = useState<SelectedRelayerType | undefined>(
    () => chainData[chainId].relayers[0],
  );

  const handleSetSelectedAsset = useCallback((value: ChainAssets) => {
    setSelectedAsset(value);
  }, []);

  const handleSetSelectedRelayer = useCallback((value: SelectedRelayerType | undefined) => {
    setSelectedRelayer(value);
  }, []);

  const handleSetChainId = useCallback((value: number) => {
    setChainId(value);
  }, []);

  const handleSetBalanceInPool = useCallback((value: string) => {
    setBalanceInPool(value);
  }, []);
  const notificationShownRef = useRef(false);

  const chain = useMemo(() => chainData[chainId], [chainId]);

  // Find the pool info based on the selected asset
  const selectedPoolInfo = useMemo(() => {
    return chain.poolInfo.find((pool) => pool.asset === selectedAsset) ?? chain.poolInfo[0];
  }, [chain.poolInfo, selectedAsset]);

  // User balance based on the selected asset
  const { data: userBalance } = useBalance({
    address,
    chainId,
    token: selectedAsset === DEFAULT_ASSET ? undefined : selectedPoolInfo.assetAddress,
  });

  const balanceBN = useMemo(() => {
    if (userBalance) {
      return userBalance;
    }
    return {
      decimals: 18,
      formatted: '0',
      symbol: selectedAsset,
      value: 0n,
    };
  }, [userBalance, selectedAsset]);

  useEffect(() => {
    if (chain) {
      fetchTokenPrice(selectedAsset)
        .then((data) => {
          setPrice(data);
        })
        .catch(() => {
          setPrice(0);
          addNotification('error', `Error fetching ${selectedAsset} price`);
        });
    }
  }, [addNotification, chain, selectedAsset]);

  const feesQueries = useQueries({
    queries: chain.relayers.map((relayer) => ({
      queryKey: ['relayerFees', relayer.url, chainId, selectedPoolInfo?.assetAddress],
      queryFn: () => {
        if (!selectedPoolInfo?.assetAddress) {
          return Promise.reject(new Error('Asset address not found for the selected pool'));
        }
        return relayerClient.fetchFees(relayer.url, chainId, selectedPoolInfo.assetAddress);
      },
      enabled: !!selectedPoolInfo?.assetAddress,
    })),
  });

  const allQueriesAreLoading = useMemo(() => feesQueries.some((q) => q.isLoading), [feesQueries]);

  const relayersData: RelayerDataType[] = useMemo(
    () =>
      feesQueries
        .map((query, index) => ({
          name: chain.relayers[index].name,
          url: chain.relayers[index].url,
          fees: query.data?.feeBPS,
          relayerAddress: query.data?.feeReceiverAddress,
          isSelectable:
            !query.error && query.data?.feeBPS !== undefined && query.data?.feeReceiverAddress !== undefined,
        }))
        .sort((a, b) => (Number(a.fees) ?? Infinity) - (Number(b.fees) ?? Infinity)),
    [feesQueries, chain.relayers],
  );

  const hasSomeRelayerAvailable = useMemo(() => {
    if (feesQueries.some((query) => query.isLoading)) return true;
    return relayersData.some((r) => r.isSelectable);
  }, [feesQueries, relayersData]);

  useEffect(() => {
    if (!hasSomeRelayerAvailable && !allQueriesAreLoading) {
      if (!notificationShownRef.current) {
        addNotification('error', 'No relayers available at the moment. Please try again later.');
        notificationShownRef.current = true;
      }
    } else {
      notificationShownRef.current = false;
    }
  }, [hasSomeRelayerAvailable, allQueriesAreLoading, addNotification]);

  // Effect to ensure the relayer selection is always valid
  useEffect(() => {
    const firstAvailable = relayersData.find((r) => r.isSelectable);
    const isCurrentSelectedStillValid = selectedRelayer
      ? relayersData.some((r) => r.url === selectedRelayer.url && r.isSelectable)
      : false;

    if (isCurrentSelectedStillValid) {
      return;
    }

    if (firstAvailable) {
      if (firstAvailable.url !== selectedRelayer?.url) {
        handleSetSelectedRelayer({ name: firstAvailable.name, url: firstAvailable.url });
      }
    } else {
      if (selectedRelayer !== undefined) {
        handleSetSelectedRelayer(undefined);
      }
    }
  }, [relayersData, selectedRelayer, handleSetSelectedRelayer]);

  const contextValue = useMemo(
    () => ({
      setChainId: handleSetChainId,
      chain,
      balanceBN,
      balanceInPoolBN,
      setBalanceInPool: handleSetBalanceInPool,
      price,
      maxDeposit: selectedPoolInfo?.maxDeposit.toString() ?? '0',
      chainId,
      selectedRelayer,
      setSelectedRelayer: handleSetSelectedRelayer,
      relayers: chain.relayers,
      relayersData,
      isLoadingRelayers: allQueriesAreLoading,
      hasSomeRelayerAvailable,
      selectedAsset,
      setSelectedAsset: handleSetSelectedAsset,
      selectedPoolInfo,
    }),
    [
      handleSetChainId,
      chain,
      balanceBN,
      balanceInPoolBN,
      handleSetBalanceInPool,
      price,
      selectedPoolInfo,
      chainId,
      selectedRelayer,
      handleSetSelectedRelayer,
      relayersData,
      allQueriesAreLoading,
      hasSomeRelayerAvailable,
      selectedAsset,
      handleSetSelectedAsset,
    ],
  );

  return <ChainContext.Provider value={contextValue}>{children}</ChainContext.Provider>;
};
