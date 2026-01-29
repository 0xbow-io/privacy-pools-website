import { getConstants } from '~/config/constants';
import {
  MtRootResponse,
  PoolResponse,
  MtLeavesResponse,
  DepositsByLabelResponse,
  AllEventsResponse,
  GlobalEventsResponse,
  BrevisAspLeavesResponse,
  BrevisAspRootResponse,
  BrevisAllDepositsRequest,
  BrevisAllDepositsResponse,
} from '~/types';

// Define type for pool stats response
interface PoolStats {
  scope: string;
  chainId: number;
  totalInPoolValue: string;
  totalInPoolValueUsd: string;
  totalDepositsValue: string;
  totalDepositsValueUsd: string;
  acceptedDepositsValue: string;
  acceptedDepositsValueUsd: string;
  totalDepositsCount: number;
  acceptedDepositsCount: number;
  pendingDepositsValue: string;
  pendingDepositsValueUsd: string;
  pendingDepositsCount: number;
  tokenSymbol: string;
  tokenAddress: string;
  growth24h?: number | null;
  pendingGrowth24h?: number | null;
}

interface PoolStatsResponse {
  pools?: PoolStats[];
  [scope: string]: PoolStats | PoolStats[] | undefined;
}

// Define type for deposits-larger-than response
interface DepositsLargerThanResponse {
  eligibleDeposits: number;
  totalDeposits: number;
  percentage: number;
  amount: string;
  scope: string;
  rank: number;
  uniqueAmountsAbove: number;
}

// Define type for pool incentives stats response
interface PoolIncentivesStats {
  scope: string;
  chainId: string;
  currentTvlUsd: string;
  avgTvlUsd: string;
  avgTvlWindowDays: number;
  tvlThresholdUsd: string;
  isRolloverActive: boolean;
  tokenSymbol: string;
  tokenAddress: string;
}

interface PoolIncentivesStatsResponse {
  pool: PoolIncentivesStats;
  cacheTimestamp: string;
}

// Define type for time-based statistics
interface TimeBasedStats {
  tvl: string;
  tvlUsd: string;
  avgDepositSize: string;
  avgDepositSizeUsd: string;
  totalDepositsCount: number;
  totalDepositsValue: string;
  totalDepositsValueUsd: string;
  totalWithdrawalsCount: number;
  totalWithdrawalsValue: string;
  totalWithdrawalsValueUsd: string;
}

// Define type for pool statistics response
interface PoolStatisticsResponse {
  pool: {
    scope: string;
    chainId: string;
    tokenSymbol: string;
    tokenAddress: string;
    tokenDecimals: number;
    allTime: TimeBasedStats;
    last24h: TimeBasedStats;
  };
  cacheTimestamp: string;
}

// Define type for global statistics response
interface GlobalStatisticsResponse {
  allTime: TimeBasedStats;
  last24h: TimeBasedStats;
  cacheTimestamp: string;
}

const { ITEMS_PER_PAGE } = getConstants();

const fetchWithHeaders = async <T>(url: string, headers?: Record<string, string>): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      ...headers,
    },
  });

  if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);
  return response.json();
};

const postWithBody = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);
  return response.json();
};

const aspClient = {
  fetchPoolInfo: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<PoolResponse>(`${aspUrl}/${chainId}/public/pool-info`, {
      'X-Pool-Scope': scope,
    }),

  fetchAllEvents: (aspUrl: string, chainId: number, scope: string, page = 1, perPage = ITEMS_PER_PAGE) =>
    fetchWithHeaders<AllEventsResponse>(`${aspUrl}/${chainId}/public/events?page=${page}&perPage=${perPage}`, {
      'X-Pool-Scope': scope,
    }),

  fetchDepositsByLabel: (aspUrl: string, chainId: number, scope: string, labels: string[]) =>
    fetchWithHeaders<DepositsByLabelResponse>(`${aspUrl}/${chainId}/public/deposits-by-label`, {
      'X-Pool-Scope': scope,
      'X-Labels': labels.join(','),
    }),

  fetchMtRoots: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<MtRootResponse>(`${aspUrl}/${chainId}/public/mt-roots`, {
      'X-Pool-Scope': scope,
    }),

  fetchMtLeaves: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<MtLeavesResponse>(`${aspUrl}/${chainId}/public/mt-leaves`, {
      'X-Pool-Scope': scope,
    }),

  fetchPoolStats: (aspUrl: string, chainId: number | 'all') =>
    fetchWithHeaders<PoolStatsResponse>(`${aspUrl}/${chainId}/public/pools-stats`),

  fetchGlobalEvents: (aspUrl: string, page = 1, perPage = ITEMS_PER_PAGE) =>
    fetchWithHeaders<GlobalEventsResponse>(`${aspUrl}/global/public/events?page=${page}&perPage=${perPage}`),

  fetchDepositsLargerThan: (aspUrl: string, chainId: number, scope: string, amount: string) =>
    fetchWithHeaders<DepositsLargerThanResponse>(`${aspUrl}/${chainId}/public/deposits-larger-than?amount=${amount}`, {
      'X-Pool-Scope': scope,
    }),

  fetchPoolStatistics: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<PoolStatisticsResponse>(`${aspUrl}/${chainId}/public/pool-statistics`, {
      'X-Pool-Scope': scope,
    }),

  fetchGlobalStatistics: (aspUrl: string) =>
    fetchWithHeaders<GlobalStatisticsResponse>(`${aspUrl}/global/public/statistics`),

  fetchPoolIncentivesStats: (aspUrl: string, chainId: number, scope: string, windowDays?: number) =>
    fetchWithHeaders<PoolIncentivesStatsResponse>(
      `${aspUrl}/${chainId}/public/pool-incentives-stats${windowDays ? `?windowDays=${windowDays}` : ''}`,
      {
        'X-Pool-Scope': scope,
      },
    ),

  // Brevis ASP endpoints
  fetchBrevisAspLeaves: (brevisAspUrl: string) => fetchWithHeaders<BrevisAspLeavesResponse>(`${brevisAspUrl}/leaves`),

  fetchBrevisAspRoot: (brevisAspUrl: string) => fetchWithHeaders<BrevisAspRootResponse>(`${brevisAspUrl}/root`),

  fetchBrevisDepositReviewStatus: (labels: string[]) => {
    const queryParams = labels.map((label) => `label=${encodeURIComponent(label)}`).join('&');
    return fetchWithHeaders<{
      err: string | null;
      depositStatus: Array<{ label: string; reviewStatus: string }>;
    }>(`https://brevis-asp-endpoint.brevis.network/v1/asp/deposits_by_label?${queryParams}`);
  },

  // Fetch all deposits from Brevis ASP with pagination and optional pool filtering
  fetchBrevisAllDeposits: (baseUrl: string, request: BrevisAllDepositsRequest) =>
    postWithBody<BrevisAllDepositsResponse>(`${baseUrl}/all_deposits`, request),
};

export { aspClient };
export type {
  PoolStats,
  PoolStatsResponse,
  DepositsLargerThanResponse,
  PoolStatisticsResponse,
  PoolIncentivesStats,
  PoolIncentivesStatsResponse,
  GlobalStatisticsResponse,
  TimeBasedStats,
};
