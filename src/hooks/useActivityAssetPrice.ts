'use client';

import { useQuery } from '@tanstack/react-query';
import { chainData } from '~/config';
import { useChainContext, usePoolAccountsContext } from '~/hooks';
import { GlobalEvent } from '~/types';
import { fetchTokenPrice } from '~/utils';

const allPools = Object.values(chainData).flatMap((chain) => chain.poolInfo);

/**
 * USD price for the asset of the currently selected activity row.
 *
 * Personal history rows always belong to the selected pool, so the chain
 * context price applies. Global rows can be for any pool on any chain, so
 * pricing them with the selected pool's price is wrong (e.g. a USDT deposit
 * priced at the ETH rate) — resolve the row's own asset price instead, and
 * return null when it can't be resolved so callers hide the USD value.
 */
export const useActivityAssetPrice = (): number | null => {
  const { price, selectedPoolInfo } = useChainContext();
  const { selectedHistoryData } = usePoolAccountsContext();

  const globalEvent =
    selectedHistoryData && 'pool' in selectedHistoryData ? (selectedHistoryData as unknown as GlobalEvent) : null;

  const rowTokenAddress = globalEvent?.pool.tokenAddress?.toLowerCase();
  const rowSymbol = globalEvent?.pool.tokenSymbol;

  const matchesSelectedPool =
    !globalEvent ||
    (globalEvent.pool.chainId === selectedPoolInfo?.chainId &&
      (rowTokenAddress === selectedPoolInfo?.assetAddress?.toLowerCase() ||
        rowSymbol?.toLowerCase() === selectedPoolInfo?.asset?.toLowerCase()));

  const rowPoolInfo = globalEvent
    ? allPools.find(
        (pool) =>
          pool.chainId === globalEvent.pool.chainId &&
          (pool.assetAddress.toLowerCase() === rowTokenAddress ||
            pool.asset.toLowerCase() === rowSymbol?.toLowerCase()),
      )
    : undefined;

  const { data: fetchedPrice } = useQuery({
    queryKey: ['activityAssetPrice', globalEvent?.pool.chainId, rowSymbol],
    queryFn: () => fetchTokenPrice(rowSymbol ?? '', rowPoolInfo),
    enabled: !!globalEvent && !matchesSelectedPool && !!rowSymbol,
    staleTime: 60_000,
  });

  if (matchesSelectedPool) return price;
  return fetchedPrice && fetchedPrice > 0 ? fetchedPrice : null;
};
