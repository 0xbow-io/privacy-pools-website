'use client';

import { useMemo } from 'react';
import { QueryObserverResult, useMutation, useQuery } from '@tanstack/react-query';
import { ExternalAspConfig } from '~/config/chainData';
import {
  PoolResponse,
  DepositsByLabelResponse,
  AllEventsResponse,
  MtLeavesResponse,
  BrevisAspLeavesResponse,
  BrevisAspRootResponse,
  ExtendedMtLeavesResponse,
  ExtendedMtRootResponse,
} from '~/types';
import { aspClient, PoolStatsResponse } from '~/utils';

export const useASP = (
  chainId: number,
  scope: string,
  aspUrl: string,
  externalAsp?: ExternalAspConfig,
): {
  isError?: boolean;
  isLoading?: boolean;
  poolsData: PoolResponse | undefined;
  rootsData: ExtendedMtRootResponse | undefined;
  mtLeavesData: ExtendedMtLeavesResponse | undefined;
  allEventsData: AllEventsResponse | undefined;
  poolStatsData: PoolStatsResponse | undefined;
  brevisAspLeavesData: BrevisAspLeavesResponse | undefined;
  brevisAspRootData: BrevisAspRootResponse | undefined;
  fetchDepositsByLabel: (labels: string[]) => Promise<DepositsByLabelResponse>;
  refetchMtLeaves: () => Promise<QueryObserverResult<MtLeavesResponse, Error>>;
} => {
  // Enable Brevis queries only if externalAsp is configured with brevis provider
  const hasBrevisAsp = externalAsp?.provider === 'brevis';
  const brevisAspUrl = hasBrevisAsp ? externalAsp.baseUrl : undefined;

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

  // Brevis ASP leaves query - only enabled if externalAsp is configured with brevis provider
  const brevisAspLeavesQuery = useQuery({
    queryKey: ['brevis_asp_leaves', brevisAspUrl],
    queryFn: () => aspClient.fetchBrevisAspLeaves(brevisAspUrl!),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: hasBrevisAsp,
  });

  // Brevis ASP root query - only enabled if externalAsp is configured with brevis provider
  const brevisAspRootQuery = useQuery({
    queryKey: ['brevis_asp_root', brevisAspUrl],
    queryFn: () => aspClient.fetchBrevisAspRoot(brevisAspUrl!),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: hasBrevisAsp,
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
  const isLoading =
    poolInfoQuery.isLoading ||
    mtRootQuery.isLoading ||
    mtLeavesQuery.isLoading ||
    (hasBrevisAsp && (brevisAspLeavesQuery.isLoading || brevisAspRootQuery.isLoading));

  // Merge Brevis data with standard data when externalAsp is configured with brevis provider
  const mergedMtLeavesData: ExtendedMtLeavesResponse | undefined = useMemo(() => {
    if (!mtLeavesQuery.data) return undefined;
    return {
      ...mtLeavesQuery.data,
      brevisAspLeaves: hasBrevisAsp ? brevisAspLeavesQuery.data?.aspLeaves : undefined,
    };
  }, [mtLeavesQuery.data, brevisAspLeavesQuery.data, hasBrevisAsp]);

  const mergedRootsData: ExtendedMtRootResponse | undefined = useMemo(() => {
    if (!mtRootQuery.data) return undefined;
    return {
      ...mtRootQuery.data,
      brevisAspMerkleTreeRoot: hasBrevisAsp ? brevisAspRootQuery.data?.aspMerkleTreeRoot : undefined,
    };
  }, [mtRootQuery.data, brevisAspRootQuery.data, hasBrevisAsp]);

  return useMemo(
    () => ({
      isError,
      isLoading,
      poolsData: poolInfoQuery.data,
      rootsData: mergedRootsData,
      mtLeavesData: mergedMtLeavesData,
      allEventsData: allEventsQuery.data,
      poolStatsData: poolStatsQuery.data,
      brevisAspLeavesData: brevisAspLeavesQuery.data,
      brevisAspRootData: brevisAspRootQuery.data,
      refetchMtLeaves: mtLeavesQuery.refetch,
      fetchDepositsByLabel: depositsByLabelQuery.mutateAsync,
    }),
    [
      isError,
      isLoading,
      poolInfoQuery.data,
      mergedRootsData,
      mergedMtLeavesData,
      allEventsQuery.data,
      poolStatsQuery.data,
      brevisAspLeavesQuery.data,
      brevisAspRootQuery.data,
      depositsByLabelQuery.mutateAsync,
      mtLeavesQuery.refetch,
    ],
  );
};
