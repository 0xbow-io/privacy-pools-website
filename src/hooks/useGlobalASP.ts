'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '~/config';
import { useChainContext } from '~/hooks';
import { GlobalEventsResponse } from '~/types';
import { aspClient } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE },
} = getConfig();

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
    queryFn: () => aspClient.fetchGlobalEvents(aspUrl, 1, 6),
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
    queryFn: () => aspClient.fetchGlobalEvents(aspUrl, currentPage, ITEMS_PER_PAGE),
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
