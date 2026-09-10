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
// its label (to test membership in the ASP leaf set) and its value.
interface PoolDepositSummary {
  label: string;
  amount: string;
}

// Shape of GET /:chainId/public/deposits (paginated).
interface DepositsPageResponse {
  page: number;
  perPage: number;
  total: number;
  depositEvents: Array<{
    label?: string | null;
    publicAmount?: string | null;
  }>;
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

  // LEGACY MIGRATION ONLY. Sends the caller's whole label set to the ASP, which
  // tells it that those deposits belong to one person. Do NOT call this from a
  // normal user path: derive approval from the ASP leaf set instead (see
  // AccountProvider). The migration flow still needs it because it must tell
  // DECLINED apart from PENDING to decide what can be migrated, and no bulk feed
  // exposes that today.
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

  // Caller-independent bulk deposit feed.
  //
  // Replaces the old `deposits-larger-than?amount=` call. That endpoint took the
  // amount the user was about to withdraw, so the ASP learned the withdrawal
  // value seconds before the matching `Withdrawn` event appeared on chain, from
  // a session that had already identified the caller's deposits. This feed is
  // the same for every caller: the client downloads the pool's deposits once and
  // answers "how many deposits are >= X?" locally, so no amount leaves the
  // browser.
  //
  // `/public/deposits` is paginated and caps perPage at 100 server-side, so page
  // until `total` is covered. `maxPages` is a runaway guard, not a policy: if it
  // trips we return what we have and the caller falls back to the leaf count.
  fetchAllPoolDeposits: async (
    aspUrl: string,
    chainId: number,
    scope: string,
    maxPages = 100,
  ): Promise<PoolDepositSummary[]> => {
    const perPage = 100;
    const collected: PoolDepositSummary[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const response = await fetchWithHeaders<DepositsPageResponse>(
        `${aspUrl}/${chainId}/public/deposits?page=${page}&perPage=${perPage}`,
        { 'X-Pool-Scope': scope },
      );

      const events = response.depositEvents ?? [];
      for (const event of events) {
        if (event.label === undefined || event.label === null) continue;
        if (event.publicAmount === undefined || event.publicAmount === null) continue;
        collected.push({ label: event.label.toString(), amount: event.publicAmount.toString() });
      }

      if (events.length < perPage) break;
      if (typeof response.total === 'number' && collected.length >= response.total) break;
    }

    return collected;
  },

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

  // LEGACY MIGRATION ONLY, and worse than the 0xbow equivalent: the labels go to
  // a third party as URL query parameters, which land in access logs by default.
  // Same rule as fetchDepositsByLabel above: never on a normal user path.
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
  PoolDepositSummary,
  DepositsPageResponse,
  PoolStatisticsResponse,
  PoolIncentivesStats,
  PoolIncentivesStatsResponse,
  GlobalStatisticsResponse,
  TimeBasedStats,
};
