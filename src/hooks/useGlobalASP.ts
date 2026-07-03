'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '~/config';
import { chainData, ExternalAspConfig } from '~/config/chainData';
import { useChainContext } from '~/hooks';
import { AllEventsResponse, GlobalEventsResponse, ReviewStatus } from '~/types';
import { aspClient } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

// Build a map of chainId+poolAddress to their external ASP configs
// Key format: "chainId:poolAddress" (lowercase) to handle same address on different chains
const getBrevisPoolConfigs = (): Map<string, ExternalAspConfig> => {
  const poolConfigs = new Map<string, ExternalAspConfig>();

  for (const chainId of Object.keys(chainData)) {
    const chain = chainData[Number(chainId)];
    for (const pool of chain.poolInfo) {
      if (pool.externalAsp?.provider === 'brevis') {
        // Include chainId in key since same pool address can exist on multiple chains
        const key = `${chainId}:${pool.address.toLowerCase()}`;
        poolConfigs.set(key, pool.externalAsp);
      }
    }
  }

  return poolConfigs;
};

// Build lookup key from chainId and poolAddress
const makePoolKey = (chainId: number | string | undefined, poolAddress: string | undefined): string | null => {
  if (!chainId || !poolAddress) return null;
  return `${chainId}:${poolAddress.toLowerCase()}`;
};

// Check if an event's pool uses Brevis ASP
const isBrevisPool = (
  chainId: number | string | undefined,
  poolAddress: string | undefined,
  brevisConfigs: Map<string, ExternalAspConfig>,
): boolean => {
  const key = makePoolKey(chainId, poolAddress);
  if (!key) return false;
  return brevisConfigs.has(key);
};

// Helper to fetch Brevis review statuses for pools using Brevis ASP and merge them into events
const enhanceWithBrevisStatuses = async (
  eventsResponse: GlobalEventsResponse | undefined,
): Promise<GlobalEventsResponse | undefined> => {
  if (!eventsResponse?.events) return eventsResponse;

  const brevisConfigs = getBrevisPoolConfigs();

  // Get deposits from pools that use Brevis ASP (match by txHash since 0xbow ASP may not have labels for BSC)
  const brevisDeposits = eventsResponse.events.filter(
    (e) => isBrevisPool(e.pool?.chainId, e.pool?.poolAddress, brevisConfigs) && e.type === 'deposit' && e.txHash,
  );

  if (brevisDeposits.length === 0) return eventsResponse;

  // Group deposits by their Brevis ASP base URL and pool address
  const depositsByConfig = new Map<string, ExternalAspConfig>();

  for (const deposit of brevisDeposits) {
    const key = makePoolKey(deposit.pool?.chainId, deposit.pool?.poolAddress);
    if (!key) continue;

    const config = brevisConfigs.get(key);
    if (!config) continue;

    // Use baseUrl + poolAddress as key to group requests (deduplicate)
    const configKey = `${config.baseUrl}|${config.poolAddress}`;
    if (!depositsByConfig.has(configKey)) {
      depositsByConfig.set(configKey, config);
    }
  }

  try {
    // Fetch statuses from all Brevis endpoints in parallel
    const statusMaps = await Promise.all(
      Array.from(depositsByConfig.entries()).map(async ([, config]) => {
        try {
          // Use the new all_deposits endpoint with pool_address filter
          const response = await aspClient.fetchBrevisAllDeposits(config.baseUrl, {
            page_size: 250, // Fetch a large page to get all deposits
            page: 1,
            sort: 1, // Descending by block_number (most recent first)
            pool_address: [config.poolAddress],
          });

          // Build a map of txHash -> status (using txHash for matching since 0xbow ASP lacks labels for BSC)
          const statusMap: Record<string, ReviewStatus> = {};

          if (response.err === null && response.depositInfo) {
            for (const deposit of response.depositInfo) {
              if (deposit.reviewStatus != null && deposit.txHash != null) {
                const status = deposit.reviewStatus.toUpperCase() as keyof typeof ReviewStatus;
                if (status in ReviewStatus) {
                  // Use lowercase txHash as key for case-insensitive matching
                  statusMap[deposit.txHash.toLowerCase()] = ReviewStatus[status];
                }
              }
            }
          }

          return { poolAddress: config.poolAddress.toLowerCase(), statusMap };
        } catch (error) {
          console.error(`Error fetching Brevis statuses for pool ${config.poolAddress}:`, error);
          return { poolAddress: config.poolAddress.toLowerCase(), statusMap: {} };
        }
      }),
    );

    // Merge all status maps by pool address
    const statusMapByPool = new Map<string, Record<string, ReviewStatus>>();
    for (const { poolAddress, statusMap } of statusMaps) {
      statusMapByPool.set(poolAddress, statusMap);
    }

    // Merge statuses into events (match by txHash)
    const enhancedEvents = eventsResponse.events.map((event) => {
      const poolAddress = event.pool?.poolAddress?.toLowerCase();
      if (!poolAddress || !isBrevisPool(event.pool?.chainId, event.pool?.poolAddress, brevisConfigs)) {
        return event;
      }

      const statusMap = statusMapByPool.get(poolAddress);
      if (statusMap && event.txHash) {
        const status = statusMap[event.txHash.toLowerCase()];
        if (status) {
          return { ...event, reviewStatus: status };
        }
      }

      return event;
    });

    return { ...eventsResponse, events: enhancedEvents };
  } catch (error) {
    console.error('Error fetching Brevis review statuses for global events:', error);
  }

  return eventsResponse;
};

export type PoolFilter = {
  chainId: number;
  pool: string;
  scope: string;
  aspUrl: string;
} | null;

type EventsResponse = GlobalEventsResponse | AllEventsResponse;

export const useGlobalASP = (): {
  isError?: boolean;
  isLoading?: boolean;
  isPageError?: boolean;
  isPageLoading?: boolean;
  globalEventsData: EventsResponse | undefined;
  globalEventsByPage: EventsResponse | undefined;
  refetchByPage: () => void;
  poolFilter: PoolFilter;
} => {
  const {
    chain: { aspUrl },
  } = useChainContext();

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page') || 1);

  // Check for pool-specific filtering from query params (e.g., from "View All" on a pool page)
  const filterChainId = searchParams.get('chainId');
  const filterPool = searchParams.get('pool');

  const poolFilter: PoolFilter = useMemo(() => {
    if (!filterChainId || !filterPool) return null;
    const parsedChainId = parseInt(filterChainId, 10);
    const chain = chainData[parsedChainId];
    if (!chain) return null;
    const poolInfo = chain.poolInfo.find((p) => p.asset.toLowerCase() === filterPool.toLowerCase());
    if (!poolInfo) return null;
    return {
      chainId: parsedChainId,
      pool: filterPool,
      scope: poolInfo.scope.toString(),
      aspUrl: chain.aspUrl,
    };
  }, [filterChainId, filterPool]);

  // Fetch first page for preview (6 items)
  const globalEventsQuery = useQuery({
    queryKey: ['asp_global_events', poolFilter?.aspUrl ?? aspUrl, poolFilter?.chainId, poolFilter?.scope],
    queryFn: async () => {
      if (poolFilter) {
        return aspClient.fetchAllEvents(poolFilter.aspUrl, poolFilter.chainId, poolFilter.scope, 1, 6);
      }
      const response = await aspClient.fetchGlobalEvents(aspUrl, 1, 6);
      return enhanceWithBrevisStatuses(response);
    },
    refetchInterval: 120000,
    staleTime: 60000,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch paginated events for full view
  const globalEventsByPageQuery = useQuery({
    queryKey: [
      'asp_global_events_by_page',
      currentPage,
      poolFilter?.aspUrl ?? aspUrl,
      poolFilter?.chainId,
      poolFilter?.scope,
    ],
    queryFn: async () => {
      if (poolFilter) {
        return aspClient.fetchAllEvents(
          poolFilter.aspUrl,
          poolFilter.chainId,
          poolFilter.scope,
          currentPage,
          ITEMS_PER_PAGE,
        );
      }
      const response = await aspClient.fetchGlobalEvents(aspUrl, currentPage, ITEMS_PER_PAGE);
      return enhanceWithBrevisStatuses(response);
    },
    refetchInterval: 60000,
    // No retryOnMount:false here — a page that failed (network blip) must
    // refetch when the user navigates back to it, not stay broken until a
    // hard refresh.
  });

  // Two consumers, two states: the home preview renders the page-1 preview
  // query (isLoading/isError), while the full activity table renders the
  // page-N query — its state must come from THAT query, otherwise a failed
  // or slow page renders as an empty "No activity found" with the pager at
  // "N OF 0" (and a Retry wired to the wrong query couldn't clear it).
  const isError = globalEventsQuery.isError;
  const isLoading = globalEventsQuery.isLoading;
  const isPageError = globalEventsByPageQuery.isError;
  const isPageLoading = globalEventsByPageQuery.isLoading;
  const refetchByPage = globalEventsByPageQuery.refetch;

  return useMemo(
    () => ({
      isError,
      isLoading,
      isPageError,
      isPageLoading,
      globalEventsData: globalEventsQuery.data,
      globalEventsByPage: globalEventsByPageQuery.data,
      refetchByPage,
      poolFilter,
    }),
    [
      isError,
      isLoading,
      isPageError,
      isPageLoading,
      globalEventsQuery.data,
      globalEventsByPageQuery.data,
      refetchByPage,
      poolFilter,
    ],
  );
};
