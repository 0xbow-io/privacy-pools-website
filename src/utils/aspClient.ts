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

// One deposit as the client needs it for local, caller-independent maths:
// Shape of GET /:chainId/public/deposit-amounts.
interface DepositAmountsResponse {
  scope: string;
  amounts: string[];
  totalDeposits: number;
  cacheTimestamp: string;
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

const validateLeaves = (leaves: unknown): string[] => {
  if (!Array.isArray(leaves) || leaves.some((leaf) => typeof leaf !== 'string' || !/^[0-9]+$/.test(leaf))) {
    throw new Error('Invalid ASP leaf snapshot');
  }
  return leaves.map((leaf) => BigInt(leaf).toString());
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

  // Legacy migration only. Normal paths derive approval from the ASP leaf set
  // (see AccountProvider); migration additionally needs DECLINED distinguished
  // from PENDING to decide what can be migrated, which no bulk feed exposes.
  fetchDepositsByLabel: (aspUrl: string, chainId: number, scope: string, labels: string[]) =>
    fetchWithHeaders<DepositsByLabelResponse>(`${aspUrl}/${chainId}/public/deposits-by-label`, {
      'X-Pool-Scope': scope,
      'X-Labels': labels.join(','),
    }),

  fetchMtRoots: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<MtRootResponse>(`${aspUrl}/${chainId}/public/mt-roots`, {
      'X-Pool-Scope': scope,
    }),

  fetchMtLeaves: async (aspUrl: string, chainId: number, scope: string): Promise<MtLeavesResponse> => {
    const data = await fetchWithHeaders<MtLeavesResponse>(`${aspUrl}/${chainId}/public/mt-leaves`, {
      'X-Pool-Scope': scope,
    });
    return { aspLeaves: validateLeaves(data?.aspLeaves), stateTreeLeaves: validateLeaves(data?.stateTreeLeaves) };
  },

  fetchPoolStats: (aspUrl: string, chainId: number | 'all') =>
    fetchWithHeaders<PoolStatsResponse>(`${aspUrl}/${chainId}/public/pools-stats`),

  fetchGlobalEvents: (aspUrl: string, page = 1, perPage = ITEMS_PER_PAGE) =>
    fetchWithHeaders<GlobalEventsResponse>(`${aspUrl}/global/public/events?page=${page}&perPage=${perPage}`),

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
  // The pool's approved deposit amounts, in wei, sorted ascending. The same
  // bytes for every caller, which is what lets it be fetched with the rest of
  // the boot traffic and answered against locally.
  fetchDepositAmounts: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<DepositAmountsResponse>(`${aspUrl}/${chainId}/public/deposit-amounts`, {
      'X-Pool-Scope': scope,
    }),

  fetchBrevisAspLeaves: async (brevisAspUrl: string): Promise<BrevisAspLeavesResponse> => {
    const data = await fetchWithHeaders<BrevisAspLeavesResponse>(`${brevisAspUrl}/leaves`);
    if (!data || data.err != null) throw new Error('Brevis approval snapshot unavailable');
    return { ...data, aspLeaves: validateLeaves(data.aspLeaves) };
  },

  fetchBrevisAspRoot: (brevisAspUrl: string) => fetchWithHeaders<BrevisAspRootResponse>(`${brevisAspUrl}/root`),

  // Legacy migration only, same rule as fetchDepositsByLabel above.
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
  DepositAmountsResponse,
  PoolStatisticsResponse,
  PoolIncentivesStats,
  PoolIncentivesStatsResponse,
  GlobalStatisticsResponse,
  TimeBasedStats,
};
