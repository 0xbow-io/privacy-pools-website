'use client';

import { useMemo } from 'react';
import { QueryObserverResult, useMutation, useQuery } from '@tanstack/react-query';
import { PoolResponse, MtRootResponse, DepositsByLabelResponse, AllEventsResponse, MtLeavesResponse } from '~/types';
import { aspClient, PoolStatsResponse } from '~/utils';

export const useASP = (
  chainId: number,
  scope: string,
  aspUrl: string,
): {
  isError?: boolean;
  isLoading?: boolean;
  poolsData: PoolResponse | undefined;
  rootsData: MtRootResponse | undefined;
  mtLeavesData: MtLeavesResponse | undefined;
  allEventsData: AllEventsResponse | undefined;
  poolStatsData: PoolStatsResponse | undefined;
  fetchDepositsByLabel: (labels: string[]) => Promise<DepositsByLabelResponse>;
  refetchMtLeaves: () => Promise<QueryObserverResult<MtLeavesResponse, Error>>;
} => {
  const poolInfoQuery = useQuery({
    queryKey: ['asp_pool_info', chainId, scope, aspUrl],
    queryFn: () => aspClient.fetchPoolInfo(aspUrl, chainId, scope),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const mtRootQuery = useQuery({
    queryKey: ['asp_mt_root', chainId, scope, aspUrl],
    queryFn: () => aspClient.fetchMtRoots(aspUrl, chainId, scope),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const mtLeavesQuery = useQuery({
    queryKey: ['asp_mt_leaves', chainId, scope, aspUrl],
    queryFn: () => aspClient.fetchMtLeaves(aspUrl, chainId, scope),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const allEventsQuery = useQuery({
    queryKey: ['asp_all_events', chainId, scope, aspUrl],
    queryFn: () => aspClient.fetchAllEvents(aspUrl, chainId, scope),
    refetchInterval: 120000, // Increased to 2 minutes
    staleTime: 60000, // Consider data fresh for 60 seconds
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const poolStatsQuery = useQuery({
    queryKey: ['asp_pool_stats', chainId, aspUrl],
    queryFn: () => aspClient.fetchPoolStats(aspUrl, chainId),
    refetchInterval: 120000, // Increased to 2 minutes
    staleTime: 60000, // Consider data fresh for 60 seconds
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const depositsByLabelQuery = useMutation({
    mutationFn: (labels: string[]) => aspClient.fetchDepositsByLabel(aspUrl, chainId, scope, labels),
  });

  const isError = poolInfoQuery.isError || mtRootQuery.isError;
  const isLoading = poolInfoQuery.isLoading || mtRootQuery.isLoading || mtLeavesQuery.isLoading;

  return useMemo(
    () => ({
      isError,
      isLoading,
      poolsData: poolInfoQuery.data,
      rootsData: mtRootQuery.data,
      mtLeavesData: mtLeavesQuery.data,
      allEventsData: allEventsQuery.data,
      poolStatsData: poolStatsQuery.data,
      refetchMtLeaves: mtLeavesQuery.refetch,
      fetchDepositsByLabel: depositsByLabelQuery.mutateAsync,
    }),
    [
      isError,
      isLoading,
      poolInfoQuery.data,
      mtRootQuery.data,
      allEventsQuery.data,
      poolStatsQuery.data,
      depositsByLabelQuery.mutateAsync,
      mtLeavesQuery.data,
      mtLeavesQuery.refetch,
    ],
  );
};
