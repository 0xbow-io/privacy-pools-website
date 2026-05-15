'use client';

import { createContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { formatUnits, parseEther } from 'viem';
import { useAccount, useBalance, usePublicClient } from 'wagmi';
import { ChainData, chainData, allPoolsChainData, ChainAssets, whitelistedChains, PoolInfo, getConfig } from '~/config';
import { getAspEndpointForChain } from '~/config/env';
import { useNotifications } from '~/hooks';
import { aspClient, fetchTokenPrice, relayerClient } from '~/utils';

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
  price: number | null;
  nativeAssetPrice: number | null;
  refetchPrice: () => void;
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
  const [price, setPrice] = useState<number | null>(null);
  const [nativeAssetPrice, setNativeAssetPrice] = useState<number | null>(null);
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
    query: {
      refetchInterval: 10_000, // Refetch every 10 seconds
    },
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

  const priceRetryRef = useRef(false);
  const priceFetchIdRef = useRef(0);

  const doFetchPrice = useCallback(() => {
    if (chain && selectedPoolInfo) {
      const fetchId = ++priceFetchIdRef.current;
      priceRetryRef.current = false;
      setPrice(null);
      fetchTokenPrice(selectedAsset, selectedPoolInfo, publicClient)
        .then((data) => {
          if (fetchId !== priceFetchIdRef.current) return; // stale — asset changed
          const fetchedPrice = data || null;
          // If a non-stablecoin gets a suspicious ~$1 price (likely stale from a previous
          // stablecoin selection), auto-retry once before accepting it
          if (fetchedPrice && fetchedPrice <= 1.1 && !selectedPoolInfo.isStableAsset && !priceRetryRef.current) {
            priceRetryRef.current = true;
            setPrice(null);
            fetchTokenPrice(selectedAsset, selectedPoolInfo, publicClient)
              .then((retryData) => {
                if (fetchId !== priceFetchIdRef.current) return;
                setPrice(retryData || null);
              })
              .catch(() => {
                if (fetchId !== priceFetchIdRef.current) return;
                setPrice(null);
              });
            return;
          }
          setPrice(fetchedPrice);
        })
        .catch(() => {
          if (fetchId !== priceFetchIdRef.current) return;
          setPrice(null);
        });
    }
  }, [chain, selectedAsset, selectedPoolInfo, publicClient]);

  useEffect(() => {
    doFetchPrice();
  }, [doFetchPrice]);

  const nativePriceFetchIdRef = useRef(0);

  const doFetchNativeAssetPrice = useCallback(() => {
    if (chain) {
      const fetchId = ++nativePriceFetchIdRef.current;
      setNativeAssetPrice(null);
      fetchTokenPrice(chain.symbol as ChainAssets)
        .then((data) => {
          if (fetchId !== nativePriceFetchIdRef.current) return;
          setNativeAssetPrice(data || null);
        })
        .catch(() => {
          if (fetchId !== nativePriceFetchIdRef.current) return;
          setNativeAssetPrice(null);
        });
    }
  }, [chain]);

  // Fetch native asset price (e.g., ETH) for gas fee calculations
  useEffect(() => {
    doFetchNativeAssetPrice();
  }, [doFetchNativeAssetPrice]);

  const refetchPrice = useCallback(() => {
    doFetchPrice();
    doFetchNativeAssetPrice();
  }, [doFetchPrice, doFetchNativeAssetPrice]);

  // Pool stats include both the token amount and the USD value of accepted
  // deposits, which lets us derive a per-token price as a fallback when
  // Alchemy's price API doesn't list the token or returns 0. This also gives
  // accurate prices for yield-bearing tokens (e.g. sUSDS trades above $1).
  const { data: poolStatsData } = useQuery({
    queryKey: ['pool_stats', chainId],
    queryFn: () => aspClient.fetchPoolStats(getAspEndpointForChain(chainId), chainId),
    enabled: !!chainId,
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const derivedPriceFromStats = useMemo(() => {
    if (!poolStatsData?.pools || !selectedPoolInfo?.scope) return null;
    const scopeStr = selectedPoolInfo.scope.toString();
    const ps = poolStatsData.pools.find((p) => p.scope === scopeStr);
    const usdStr = ps?.acceptedDepositsValueUsd ?? ps?.totalInPoolValueUsd;
    const tokensStr = ps?.acceptedDepositsValue ?? ps?.totalInPoolValue;
    if (!usdStr || !tokensStr) return null;
    const usd = parseFloat(String(usdStr).replace(/,/g, ''));
    if (!Number.isFinite(usd) || usd <= 0) return null;
    let tokens: number;
    try {
      tokens = Number(formatUnits(BigInt(tokensStr), selectedPoolInfo.assetDecimals || 18));
    } catch {
      return null;
    }
    if (tokens <= 0) return null;
    return usd / tokens;
  }, [poolStatsData, selectedPoolInfo]);

  // Live token price from Alchemy/conversion if available, otherwise fall
  // back to the price derived from the ASP pool stats. Exposed to all
  // consumers via context.price so the withdraw review modal, fee breakdown,
  // pool page and anywhere else stay consistent.
  const effectivePrice = price ?? derivedPriceFromStats;

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

  // Preserve the order configured in chainData so the primary relayer
  // (Fast Relay) is always shown first in the UI even when an alternative
  // relayer happens to be cheaper.
  const relayersData: RelayerDataType[] = useMemo(
    () =>
      feesQueries.map((query, index) => ({
        name: activeRelayers[index].name,
        url: activeRelayers[index].url,
        fees: query.data?.feeBPS,
        relayerAddress: query.data?.feeReceiverAddress,
        isSelectable: !query.error && query.data?.feeBPS !== undefined && query.data?.feeReceiverAddress !== undefined,
      })),
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

  // Effect to ensure the relayer selection is always valid.
  //
  // Wait for every relayer's /details query to finish before doing the
  // auto-select. Otherwise the first relayer to respond (e.g. a faster
  // secondary relayer) wins the default slot and the configured primary
  // (Fast Relay) never gets re-selected once it loads, because the effect
  // sees a valid current selection and bails out.
  useEffect(() => {
    if (allQueriesAreLoading) return;

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
  }, [allQueriesAreLoading, relayersData, selectedRelayer, handleSetSelectedRelayer]);

  const contextValue = useMemo(
    () => ({
      setChainId: handleSetChainId,
      chain,
      balanceBN,
      balanceInPoolBN,
      setBalanceInPool: handleSetBalanceInPool,
      price: effectivePrice,
      nativeAssetPrice,
      refetchPrice,
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
      effectivePrice,
      nativeAssetPrice,
      refetchPrice,
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
