'use client';

import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { getConfig } from '~/config';
import { useChainContext, useExternalServices, useAccountContext, useGlobalASP } from '~/hooks';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

export const useAdvancedView = () => {
  const {
    chainId,
    selectedPoolInfo,
    balanceBN: { decimals },
  } = useChainContext();
  const { isLoading: isLoadingExternalServices } = useExternalServices();
  const { poolAccounts, historyData, hideEmptyPools } = useAccountContext();
  const {
    globalEventsData,
    globalEventsByPage,
    isLoading: isLoadingGlobalEvents,
    isPageLoading,
    isPageError,
    refetchByPage,
    poolFilter,
  } = useGlobalASP();

  const allEventsByPage = globalEventsByPage?.events ?? [];

  const isLoading = isLoadingExternalServices || isLoadingGlobalEvents;

  // When a pool filter is active (from URL params), filter by that pool;
  // otherwise show all personal activity across all pools.
  const orderedPersonalActivity = useMemo(() => {
    const filtered = poolFilter
      ? historyData.filter(
          (event) => event.scope?.toString() === poolFilter.scope && event.chainId === poolFilter.chainId,
        )
      : historyData;
    return [...filtered].sort((a, b) => b.timestamp - a.timestamp);
  }, [historyData, poolFilter]);

  // Filter pool accounts based on hideEmptyPools setting
  const filteredPoolAccounts = useMemo(() => {
    return hideEmptyPools
      ? poolAccounts.filter((account) => formatUnits(account.balance, decimals) !== '0')
      : poolAccounts;
  }, [poolAccounts, hideEmptyPools, decimals]);

  // Ordered pool accounts from newest to oldest and filter by selectedPoolInfo.scope and chainId
  const orderedPoolAccounts = useMemo(
    () =>
      [...filteredPoolAccounts]
        .filter((account) => account.scope === selectedPoolInfo.scope && account.chainId === chainId)
        .sort((a, b) => Number(b.deposit.timestamp || 0) - Number(a.deposit.timestamp || 0)),
    [filteredPoolAccounts, selectedPoolInfo.scope, chainId],
  );

  const fullPoolAccounts = useMemo(() => orderedPoolAccounts, [orderedPoolAccounts]);
  const previewPoolAccounts = useMemo(() => orderedPoolAccounts.slice(0, 6), [orderedPoolAccounts]);

  const fullPersonalActivity = useMemo(() => orderedPersonalActivity, [orderedPersonalActivity]);
  const previewPersonalActivity = useMemo(() => orderedPersonalActivity.slice(0, 6), [orderedPersonalActivity]);

  const recentGlobalEvents = useMemo(() => globalEventsData?.events ?? [], [globalEventsData?.events]);
  const previewGlobalEvents = useMemo(() => recentGlobalEvents?.slice(0, 6), [recentGlobalEvents]);

  return {
    ITEMS_PER_PAGE,
    previewPoolAccounts,
    fullPoolAccounts,
    previewGlobalEvents,
    allEventsByPage,
    previewPersonalActivity,
    fullPersonalActivity,
    isLoading,
    isPageLoading: isLoadingExternalServices || isPageLoading,
    isPageError,
    refetchByPage,
    globalEventsCount: globalEventsByPage?.total ?? 0,
    poolFilter,
  };
};
