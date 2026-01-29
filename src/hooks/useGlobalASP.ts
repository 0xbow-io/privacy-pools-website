'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '~/config';
import { useChainContext } from '~/hooks';
import { GlobalEventsResponse, ReviewStatus } from '~/types';
import { aspClient } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

// Helper to fetch Brevis review statuses for chain 56 deposits and merge them into events
const enhanceWithBrevisStatuses = async (
  eventsResponse: GlobalEventsResponse | undefined,
): Promise<GlobalEventsResponse | undefined> => {
  if (!eventsResponse?.events) return eventsResponse;

  // Get chain 56 deposit labels
  const chain56Labels = eventsResponse.events
    .filter((e) => e.pool?.chainId === 56 && e.type === 'deposit' && e.label != null)
    .map((e) => e.label as string);

  if (chain56Labels.length === 0) return eventsResponse;

  try {
    const brevisResponse = await aspClient.fetchBrevisDepositReviewStatus(chain56Labels);

    if (brevisResponse.err === null && brevisResponse.depositStatus) {
      // Build a map of label -> status
      const statusMap: Record<string, ReviewStatus> = {};
      for (const deposit of brevisResponse.depositStatus) {
        if (deposit.reviewStatus != null && deposit.label != null) {
          const status = deposit.reviewStatus.toUpperCase() as keyof typeof ReviewStatus;
          if (status in ReviewStatus) {
            statusMap[deposit.label] = ReviewStatus[status];
          }
        }
      }

      // Merge statuses into events
      const enhancedEvents = eventsResponse.events.map((event) => {
        if (event.pool?.chainId === 56 && event.label != null && statusMap[event.label]) {
          return { ...event, reviewStatus: statusMap[event.label] };
        }
        return event;
      });

      return { ...eventsResponse, events: enhancedEvents };
    }
  } catch (error) {
    console.error('Error fetching Brevis review statuses for global events:', error);
  }

  return eventsResponse;
};

export const useGlobalASP = (): {
  isError?: boolean;
  isLoading?: boolean;
  globalEventsData: GlobalEventsResponse | undefined;
  globalEventsByPage: GlobalEventsResponse | undefined;
} => {
  const {
    chain: { aspUrl },
  } = useChainContext();

  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page') || 1);

  // Fetch first page for preview (6 items)
  const globalEventsQuery = useQuery({
    queryKey: ['asp_global_events', aspUrl],
    queryFn: async () => {
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
    queryKey: ['asp_global_events_by_page', currentPage, aspUrl],
    queryFn: async () => {
      const response = await aspClient.fetchGlobalEvents(aspUrl, currentPage, ITEMS_PER_PAGE);
      return enhanceWithBrevisStatuses(response);
    },
    refetchInterval: 60000,
    retryOnMount: false,
  });

  const isError = globalEventsQuery.isError;
  const isLoading = globalEventsQuery.isLoading;

  return useMemo(
    () => ({
      isError,
      isLoading,
      globalEventsData: globalEventsQuery.data,
      globalEventsByPage: globalEventsByPageQuery.data,
    }),
    [isError, isLoading, globalEventsQuery.data, globalEventsByPageQuery.data],
  );
};
