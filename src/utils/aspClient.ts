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
  id?: number;
  eventStatus?: string;
  // Must describe the latest decision, never an arbitrary historical approval.
  reviewStatus?: string;
}

// Shape of GET /:chainId/public/deposits (paginated).
interface DepositsPageResponse {
  page: number;
  perPage: number;
  total?: number;
  depositEvents: Array<{
    label?: string | null;
    publicAmount?: string | null;
    id?: number;
    eventStatus?: string;
    reviewStatus?: string;
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

  // Shared, 1-based feed. Fetch bounded batches and require a terminal short
  // page; totals alone are not reliable evidence of completion. Any failure or
  // inconsistent snapshot rejects the entire result.
  fetchAllPoolDeposits: async (
    aspUrl: string,
    chainId: number,
    scope: string,
    maxPages = 100,
  ): Promise<PoolDepositSummary[]> => {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('Invalid page limit');
    const perPage = 100;
    const collected: PoolDepositSummary[] = [];
    const seenLabels = new Set<string>();
    const seenIds = new Set<number>();
    let total: number | undefined;
    let rows = 0;

    for (let firstPage = 1; firstPage <= maxPages; ) {
      // Start with one page so small pools only cost one request. Thereafter
      // use at most five concurrent requests, including a terminal probe.
      const lastExpectedPage = total === undefined ? maxPages : Math.floor(total / perPage) + 1;
      const batchSize = firstPage === 1 ? 1 : Math.min(5, Math.max(1, lastExpectedPage - firstPage + 1));
      const pages = Array.from({ length: Math.min(batchSize, maxPages - firstPage + 1) }, (_, i) => firstPage + i);
      const responses = await Promise.allSettled(
        pages.map((page) =>
          fetchWithHeaders<DepositsPageResponse>(
            `${aspUrl}/${chainId}/public/deposits?page=${page}&perPage=${perPage}`,
            { 'X-Pool-Scope': scope },
          ),
        ),
      );
      for (const [index, result] of responses.entries()) {
        if (result.status === 'rejected') throw new Error('Deposit snapshot unavailable');
        const response = result.value;
        if (
          !response ||
          response.page !== pages[index] ||
          response.perPage !== perPage ||
          !Array.isArray(response.depositEvents) ||
          response.depositEvents.length > perPage
        ) {
          throw new Error('Invalid deposit page');
        }
        if (response.total !== undefined) {
          if (
            !Number.isSafeInteger(response.total) ||
            response.total < 0 ||
            (total !== undefined && total !== response.total)
          )
            throw new Error('Inconsistent deposit total');
          total = response.total;
        }
        const events = response.depositEvents;
        // This feed backs the anonymity-set figure. The current ASP omits the
        // latest review decision, so stop early rather than downloading dozens
        // of pages that still cannot produce a safe count.
        if (events.some((event) => !event || typeof event.reviewStatus !== 'string')) {
          throw new Error('Latest deposit review status unavailable');
        }
        rows += events.length;
        for (const event of events) {
          if (!event || typeof event !== 'object') throw new Error('Invalid deposit row');
          if (event.id !== undefined) {
            if (!Number.isSafeInteger(event.id) || seenIds.has(event.id))
              throw new Error('Duplicate or invalid deposit ID');
            seenIds.add(event.id);
          }
          if (event.label == null || event.publicAmount == null) continue;
          if (typeof event.label !== 'string' || !/^[0-9]+$/.test(event.label))
            throw new Error('Invalid deposit label');
          const label = BigInt(event.label).toString();
          if (seenLabels.has(label)) throw new Error('Duplicate deposit label');
          seenLabels.add(label);
          // Numeric JSON amounts may already have lost wei precision.
          if (typeof event.publicAmount !== 'string') throw new Error('Invalid deposit amount');
          collected.push({
            label,
            amount: event.publicAmount,
            id: event.id,
            eventStatus: event.eventStatus,
            reviewStatus: event.reviewStatus,
          });
        }
        if (events.length < perPage) {
          if (total !== undefined && rows !== total) throw new Error('Incomplete deposit snapshot');
          return collected;
        }
        if (total !== undefined && rows > total) throw new Error('Inconsistent deposit total');
      }
      firstPage += pages.length;
    }
    throw new Error('Deposit snapshot exceeds page limit');
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
  PoolDepositSummary,
  DepositsPageResponse,
  PoolStatisticsResponse,
  PoolIncentivesStats,
  PoolIncentivesStatsResponse,
  GlobalStatisticsResponse,
  TimeBasedStats,
};
