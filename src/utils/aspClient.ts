import { getConstants } from '~/config/constants';
import { MtRootResponse, PoolResponse, MtLeavesResponse, DepositsByLabelResponse, AllEventsResponse } from '~/types';

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
};

export { aspClient };
