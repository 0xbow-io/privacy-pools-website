'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { getConfig } from '~/config';
import { useChainContext, useExternalServices, useAccountContext } from '~/hooks';
import { aspClient } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

export const useAdvancedView = () => {
  const {
    chainId,
    chain: { aspUrl },
    selectedPoolInfo,
    balanceBN: { decimals },
  } = useChainContext();
  const { aspData, isLoading: isLoadingExternalServices } = useExternalServices();
  const { poolAccounts, historyData, hideEmptyPools } = useAccountContext();

  // moved outside useExternalServices to avoid pre-rendering errors with useSearchParams
  // https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page') || 1);

  const allEventsByPageQuery = useQuery({
    queryKey: ['asp_all_events_by_page', currentPage, chainId, selectedPoolInfo.scope.toString()],
    queryFn: () => aspClient.fetchAllEvents(aspUrl, chainId, selectedPoolInfo.scope.toString(), currentPage),
    refetchInterval: 60000,
    retryOnMount: false,
  });
  const allEventsByPage = allEventsByPageQuery.data?.events ?? [];

  const isLoading = isLoadingExternalServices || allEventsByPageQuery.isLoading;

  // Ordered personal activity from newest to oldest
  const orderedPersonalActivity = useMemo(
    () =>
      historyData
        .filter((account) => account.scope === selectedPoolInfo.scope)
        .sort((a, b) => b.timestamp - a.timestamp),
    [historyData, selectedPoolInfo.scope],
  );

  // Filter pool accounts based on hideEmptyPools setting
  const filteredPoolAccounts = useMemo(() => {
    return hideEmptyPools
      ? poolAccounts.filter((account) => formatUnits(account.balance, decimals) !== '0')
      : poolAccounts;
  }, [poolAccounts, hideEmptyPools, decimals]);

  // Ordered pool accounts from newest to oldest and filter by selectedPoolInfo.scope
  const orderedPoolAccounts = useMemo(
    () =>
      [...filteredPoolAccounts]
        .filter((account) => account.scope === selectedPoolInfo.scope)
        .sort((a, b) => Number(b.deposit.timestamp || 0) - Number(a.deposit.timestamp || 0)),
    [filteredPoolAccounts, selectedPoolInfo.scope],
  );

  const fullPoolAccounts = useMemo(() => orderedPoolAccounts, [orderedPoolAccounts]);
  const previewPoolAccounts = useMemo(() => orderedPoolAccounts.slice(0, 6), [orderedPoolAccounts]);

  const fullPersonalActivity = useMemo(() => orderedPersonalActivity, [orderedPersonalActivity]);
  const previewPersonalActivity = useMemo(() => orderedPersonalActivity.slice(0, 6), [orderedPersonalActivity]);

  const recentGlobalEvents = useMemo(() => aspData?.allEventsData?.events ?? [], [aspData?.allEventsData?.events]);
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
    globalEventsCount: aspData?.allEventsData?.total ?? 0,
  };
};
