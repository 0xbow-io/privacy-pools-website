'use client';

import { createContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { parseEther } from 'viem';
import { useAccount, useBalance, usePublicClient } from 'wagmi';
import { ChainData, chainData, allPoolsChainData, ChainAssets, whitelistedChains, PoolInfo, getConfig } from '~/config';
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
  nativeAssetPrice: number;
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
  // Chain filter for All Pools page
  selectedChainIds: number[];
  setSelectedChainIds: (value: number[]) => void;
  allPoolsChains: { chainId: number; name: string; icon: string }[];
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
  const publicClient = usePublicClient();
  const [chainId, setChainId] = useState(whitelistedChains[0].id);
  const { addNotification } = useNotifications();
  const [balanceInPoolBN, setBalanceInPool] = useState<string>(parseEther('100').toString());
  const [price, setPrice] = useState<number>(0);
  const [nativeAssetPrice, setNativeAssetPrice] = useState<number>(0);
  const [selectedAsset, setSelectedAsset] = useState<ChainAssets>(DEFAULT_ASSET);
  const [selectedRelayer, setSelectedRelayer] = useState<SelectedRelayerType | undefined>(
    () => chainData[chainId].relayers[0],
  );
  const [selectedChainIds, setSelectedChainIds] = useState<number[]>([]);

  // Get all chains available in allPoolsChainData for the chain filter
  const allPoolsChains = useMemo(() => {
    return Object.entries(allPoolsChainData).map(([id, chain]) => ({
      chainId: parseInt(id),
      name: chain.name,
      icon: chain.image,
    }));
  }, []);

  const handleSetSelectedChainIds = useCallback((value: number[]) => {
    setSelectedChainIds(value);
  }, []);

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

  const chain = useMemo(() => chainData[chainId] || chainData[whitelistedChains[0].id], [chainId]);

  // Find the pool info based on the selected asset (case-insensitive)
  const selectedPoolInfo = useMemo(() => {
    if (!chain?.poolInfo || chain.poolInfo.length === 0) {
      return {} as PoolInfo;
    }
    return chain.poolInfo.find((pool) => pool.asset.toLowerCase() === selectedAsset.toLowerCase()) ?? chain.poolInfo[0];
  }, [chain, selectedAsset]);

  // Use pool-specific relayers if available, otherwise fall back to chain defaults
  const activeRelayers = useMemo(() => {
    if (selectedPoolInfo?.relayersOverride && selectedPoolInfo.relayersOverride.length > 0) {
      return selectedPoolInfo.relayersOverride;
    }
    return chain.relayers;
  }, [selectedPoolInfo, chain.relayers]);

  console.log(
    `fetching data for chainId: ${chainId}, selectedAsset: ${selectedAsset}, token: ${selectedAsset === DEFAULT_ASSET ? undefined : selectedPoolInfo.assetAddress}`,
  );
  // User balance based on the selected asset
  const { data: userBalance } = useBalance({
    address,
    chainId,
    token: selectedPoolInfo.isNativeToken ? undefined : selectedPoolInfo.assetAddress, //selectedAsset === DEFAULT_ASSET ? undefined : selectedPoolInfo.assetAddress,
  });

  console.log(`User balance for asset ${selectedAsset} on chain ${chainId}:`, userBalance);

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
    if (chain && selectedPoolInfo) {
      fetchTokenPrice(selectedAsset, selectedPoolInfo, publicClient)
        .then((data) => {
          setPrice(data);
        })
        .catch(() => {
          setPrice(0);
          addNotification('error', `Error fetching ${selectedAsset} price`);
        });
    }
  }, [addNotification, chain, selectedAsset, selectedPoolInfo, publicClient]);

  // Fetch native asset price (e.g., ETH) for gas fee calculations
  useEffect(() => {
    if (chain) {
      fetchTokenPrice(chain.symbol as ChainAssets)
        .then((data) => {
          setNativeAssetPrice(data);
        })
        .catch(() => {
          setNativeAssetPrice(0);
          console.error(`Error fetching ${chain.symbol} price for gas calculations`);
        });
    }
  }, [chain]);

  const feesQueries = useQueries({
    queries: activeRelayers.map((relayer) => ({
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
          name: activeRelayers[index].name,
          url: activeRelayers[index].url,
          fees: query.data?.feeBPS,
          relayerAddress: query.data?.feeReceiverAddress,
          isSelectable:
            !query.error && query.data?.feeBPS !== undefined && query.data?.feeReceiverAddress !== undefined,
        }))
        .sort((a, b) => (Number(a.fees) ?? Infinity) - (Number(b.fees) ?? Infinity)),
    [feesQueries, activeRelayers],
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
      nativeAssetPrice,
      maxDeposit: selectedPoolInfo?.maxDeposit.toString() ?? '0',
      chainId,
      selectedRelayer,
      setSelectedRelayer: handleSetSelectedRelayer,
      relayers: activeRelayers,
      relayersData,
      isLoadingRelayers: allQueriesAreLoading,
      hasSomeRelayerAvailable,
      selectedAsset,
      setSelectedAsset: handleSetSelectedAsset,
      selectedPoolInfo,
      selectedChainIds,
      setSelectedChainIds: handleSetSelectedChainIds,
      allPoolsChains,
    }),
    [
      handleSetChainId,
      chain,
      balanceBN,
      balanceInPoolBN,
      handleSetBalanceInPool,
      price,
      nativeAssetPrice,
      selectedPoolInfo,
      chainId,
      selectedRelayer,
      handleSetSelectedRelayer,
      activeRelayers,
      relayersData,
      allQueriesAreLoading,
      hasSomeRelayerAvailable,
      selectedAsset,
      handleSetSelectedAsset,
      selectedChainIds,
      handleSetSelectedChainIds,
      allPoolsChains,
    ],
  );

  return <ChainContext.Provider value={contextValue}>{children}</ChainContext.Provider>;
};
