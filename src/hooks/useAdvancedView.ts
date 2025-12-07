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
  const { globalEventsData, globalEventsByPage, isLoading: isLoadingGlobalEvents } = useGlobalASP();

  const allEventsByPage = globalEventsByPage?.events ?? [];

  const isLoading = isLoadingExternalServices || isLoadingGlobalEvents;

  // Ordered personal activity from newest to oldest
  const orderedPersonalActivity = useMemo(
    () =>
      historyData
        .filter((account) => account.scope === selectedPoolInfo.scope && account.chainId === chainId)
        .sort((a, b) => b.timestamp - a.timestamp),
    [historyData, selectedPoolInfo.scope, chainId],
  );

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
    globalEventsCount: globalEventsByPage?.total ?? 0,
  };
};
