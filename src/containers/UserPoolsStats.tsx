'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Box, Grid, Stack, styled, Typography } from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { chainData, PoolInfo } from '~/config';
import { useAccountContext } from '~/hooks';
import { ReviewStatus, type PoolResponse } from '~/types';
import { aspClient, fetchTokenPrice } from '~/utils';
import { calculateDepositVarianceScore, PoolCardData } from './AllPoolsStats';

interface UserPoolsStatsProps {
  selectedChainIds?: number[];
}

export const UserPoolsStats = ({ selectedChainIds = [] }: UserPoolsStatsProps) => {
  const { poolAccountsByChainScope } = useAccountContext();
  const publicClient = usePublicClient();

  // Get unique pool combinations from user's pool accounts (across all chains/scopes)
  const userPoolsToQuery = useMemo(() => {
    const uniquePools = new Map<string, { chainId: number; scope: string; poolInfo: PoolInfo; originalKey: string }>();

    // Iterate through all cached pool accounts from all chains/scopes
    for (const [key, poolAccounts] of Object.entries(poolAccountsByChainScope)) {
      if (!poolAccounts || poolAccounts.length === 0) continue;

      // Get the first account to extract chain and scope info
      const firstAccount = poolAccounts[0];
      const chain = chainData[firstAccount.chainId];
      if (!chain) continue;

      // Filter by selected chains (empty array means show all)
      if (selectedChainIds.length > 0 && !selectedChainIds.includes(firstAccount.chainId)) {
        continue;
      }

      const poolInfo = chain.poolInfo.find((p) => p.scope.toString() === firstAccount.scope.toString());
      if (!poolInfo) continue;

      if (!uniquePools.has(key)) {
        uniquePools.set(key, {
          chainId: firstAccount.chainId,
          scope: firstAccount.scope.toString(),
          poolInfo,
          originalKey: key, // Store the original key to use for lookups
        });
      }
    }

    return Array.from(uniquePools.values()).map((pool) => {
      const chain = chainData[pool.chainId];
      return {
        ...pool,
        aspUrl: chain.aspUrl,
      };
    });
  }, [poolAccountsByChainScope, selectedChainIds]);

  // Get unique chain IDs for fetching pools-stats
  const uniqueChainIds = useMemo(() => {
    return Array.from(new Set(userPoolsToQuery.map((pool) => pool.chainId)));
  }, [userPoolsToQuery]);

  // Fetch pool info for each user pool
  const poolInfoQueries = useQueries({
    queries: userPoolsToQuery.map((pool) => ({
      queryKey: ['user_pool_info', pool.chainId, pool.scope, pool.aspUrl],
      queryFn: () => aspClient.fetchPoolInfo(pool.aspUrl, pool.chainId, pool.scope),
      refetchInterval: 120000, // Increased to 2 minutes
      staleTime: 60000, // Consider data fresh for 60 seconds
      retryOnMount: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  // Fetch pools-stats for each chain to get growth24h data
  const poolStatsQueries = useQueries({
    queries: uniqueChainIds.map((chainId) => {
      const aspUrl = chainData[chainId].aspUrl;
      return {
        queryKey: ['user_pools_stats', chainId, aspUrl],
        queryFn: () => aspClient.fetchPoolStats(aspUrl, chainId),
        refetchInterval: 120000,
        staleTime: 60000,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      };
    }),
  });

  // Get unique assets to fetch prices for
  const uniqueAssets = useMemo(() => {
    const assets = new Map<string, PoolInfo>();
    userPoolsToQuery.forEach((pool) => {
      if (!assets.has(pool.poolInfo.asset)) {
        assets.set(pool.poolInfo.asset, pool.poolInfo);
      }
    });
    return Array.from(assets.entries());
  }, [userPoolsToQuery]);

  // Fetch token prices for each unique asset
  const priceQueries = useQueries({
    queries: uniqueAssets.map(([asset, poolInfo]) => ({
      queryKey: ['token_price', asset],
      queryFn: () => fetchTokenPrice(asset, poolInfo, publicClient),
      refetchInterval: 120000,
      staleTime: 60000,
      retryOnMount: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  // Build a map of asset prices
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    priceQueries.forEach((query, index) => {
      const asset = uniqueAssets[index][0];
      if (query.data !== undefined) {
        map.set(asset, query.data);
      }
    });
    return map;
  }, [priceQueries, uniqueAssets]);

  // Build a map of pool data by chainId and scope for easy lookup
  const poolDataMap = useMemo(() => {
    const map = new Map<string, PoolResponse>();

    // First, build map of growth data by chainId and scope from poolStatsQueries
    const growthDataMap = new Map<string, number | null>();
    poolStatsQueries.forEach((query, index) => {
      if (!query.data?.pools) return;
      const chainId = uniqueChainIds[index];

      query.data.pools.forEach((poolStats) => {
        const key = `${chainId}-${poolStats.scope}`;
        growthDataMap.set(key, poolStats.growth24h ?? null);
      });
    });

    // Then, build the main pool data map with growth data merged in
    poolInfoQueries.forEach((query, index) => {
      if (!query.data) return;
      const pool = userPoolsToQuery[index];
      const key = `${pool.chainId}-${pool.scope}`;

      // Merge growth24h data from poolStatsQueries
      const growth24h = growthDataMap.get(key);
      map.set(key, {
        ...query.data,
        growth24h,
      });
    });

    return map;
  }, [poolInfoQueries, poolStatsQueries, userPoolsToQuery, uniqueChainIds]);

  // Build pool list from user's pools with real stats
  const userPools = useMemo(() => {
    const pools: PoolCardData[] = [];

    userPoolsToQuery.forEach((poolToQuery) => {
      const chain = chainData[poolToQuery.chainId];
      const dataKey = `${poolToQuery.chainId}-${poolToQuery.scope}`;
      const poolData = poolDataMap.get(dataKey);

      const totalFunds = poolData?.totalInPoolValue ? BigInt(poolData.totalInPoolValue) : BigInt(0);

      pools.push({
        poolName: `${chain.name} - ${poolToQuery.poolInfo.asset} Pool`,
        icon: poolToQuery.poolInfo.icon,
        asset: poolToQuery.poolInfo.asset,
        chainId: poolToQuery.chainId,
        chainName: chain.name,
        chainIcon: chain.image,
        scope: poolToQuery.scope,
        totalFunds,
        fundsPending: BigInt(0),
        decimals: poolToQuery.poolInfo.assetDecimals || 18,
        growthPercentage: poolData?.growth24h ?? undefined,
        acceptedDepositsCount: poolData?.acceptedDepositsCount || 0,
        depositVarianceScore: calculateDepositVarianceScore(poolData),
        originalKey: poolToQuery.originalKey, // Store the original key for accurate lookups
      });
    });

    return pools;
  }, [userPoolsToQuery, poolDataMap]);

  if (userPools.length === 0) {
    return null;
  }

  return (
    <PoolsGridContainer>
      <PoolsGrid container spacing={0}>
        {userPools.map((pool, index, arr) => {
          const isOdd = arr.length % 2 === 1;
          const isLast = index === arr.length - 1;

          // If odd count and this is the last pool, show it with pending card beside it
          if (isOdd && isLast) {
            const needsBorderTop = arr.length > 2;
            return (
              <React.Fragment key={`${pool.chainId}-${pool.scope}-${index}`}>
                <Grid item xs={12} sm={6}>
                  <BalanceOnlyCard pool={pool} price={priceMap.get(pool.asset) ?? 0} hasBorderTop={needsBorderTop} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <PendingOnlyCard pool={pool} hasBorderTop={needsBorderTop} />
                </Grid>
              </React.Fragment>
            );
          }

          return (
            <Grid item xs={12} sm={6} key={`${pool.chainId}-${pool.scope}-${index}`}>
              <PoolCard
                pool={pool}
                isLeftColumn={index % 2 === 0}
                isFirstRow={index < 2}
                price={priceMap.get(pool.asset) ?? 0}
              />
            </Grid>
          );
        })}
      </PoolsGrid>
    </PoolsGridContainer>
  );
};

const PoolCard = ({
  pool,
  isLeftColumn,
  isFirstRow,
  price,
}: {
  pool: PoolCardData;
  isLeftColumn: boolean;
  isFirstRow: boolean;
  price: number;
}) => {
  const router = useRouter();
  const { poolAccountsByChainScope, hasProcessedInitialDeposits } = useAccountContext();

  // Use the originalKey if available, otherwise fallback to constructing the key
  const dataKey = pool.originalKey || `${pool.chainId}-${pool.scope}`;
  const poolAccounts = poolAccountsByChainScope[dataKey] || [];

  // Calculate my balance (sum of all balances for this pool)
  const myBalance = poolAccounts.reduce((sum, pa) => sum + BigInt(pa.balance || 0), BigInt(0));
  const myBalanceFormatted = formatUnits(myBalance, pool.decimals);
  const myBalanceTokenAmount = Number(myBalanceFormatted);
  const myBalanceUsd = price ? myBalanceTokenAmount * price : null;

  // Calculate pending (sum of balances where reviewStatus is PENDING)
  // Show $0 until the initial deposit status fetch completes to avoid showing incorrect pending values
  const pending = hasProcessedInitialDeposits
    ? poolAccounts.reduce(
        (sum, pa) => (pa.reviewStatus === ReviewStatus.PENDING ? sum + BigInt(pa.balance || 0) : sum),
        BigInt(0),
      )
    : BigInt(0);

  const pendingFormatted = formatUnits(pending, pool.decimals);
  const pendingTokenAmount = Number(pendingFormatted);

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <PoolCardContainer isLeftColumn={isLeftColumn} isFirstRow={isFirstRow} onClick={handleClick}>
      <PoolHeader>
        <Stack direction='row' alignItems='center' gap={1}>
          {pool.icon && (
            <IconWrapper>
              <Image src={pool.icon} alt={pool.asset} width={24} height={24} />
              {pool.chainIcon && (
                <ChainIconOverlay>
                  <Image src={pool.chainIcon} alt={pool.chainName} width={14} height={14} />
                </ChainIconOverlay>
              )}
            </IconWrapper>
          )}
          <Stack direction='column' gap='2px'>
            <PoolName variant='body1'>{pool.asset} Pool</PoolName>
            <ChainName variant='caption'>{pool.chainName}</ChainName>
          </Stack>
        </Stack>
      </PoolHeader>

      <StatsRow>
        <StatColumn>
          <StatLabel>My balance</StatLabel>
          <BalanceValue>{myBalanceTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</BalanceValue>
          <StatSubtext>
            {myBalanceUsd != null ? `$${myBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}
          </StatSubtext>
        </StatColumn>
        <StatColumn align='right'>
          <StatLabel>Pending</StatLabel>
          <PendingValue>{pendingTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</PendingValue>
        </StatColumn>
      </StatsRow>
    </PoolCardContainer>
  );
};

const BalanceOnlyCard = ({
  pool,
  price,
  hasBorderTop,
}: {
  pool: PoolCardData;
  price: number;
  hasBorderTop?: boolean;
}) => {
  const router = useRouter();
  const { poolAccountsByChainScope } = useAccountContext();

  const dataKey = pool.originalKey || `${pool.chainId}-${pool.scope}`;
  const poolAccounts = poolAccountsByChainScope[dataKey] || [];

  const myBalance = poolAccounts.reduce((sum, pa) => sum + BigInt(pa.balance || 0), BigInt(0));
  const myBalanceFormatted = formatUnits(myBalance, pool.decimals);
  const myBalanceTokenAmount = Number(myBalanceFormatted);
  const myBalanceUsd = price ? myBalanceTokenAmount * price : null;

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <SinglePoolCardContainer onClick={handleClick} hasBorderTop={hasBorderTop}>
      <PoolHeader>
        <Stack direction='row' alignItems='center' gap={1}>
          {pool.icon && (
            <IconWrapper>
              <Image src={pool.icon} alt={pool.asset} width={24} height={24} />
              {pool.chainIcon && (
                <ChainIconOverlay>
                  <Image src={pool.chainIcon} alt={pool.chainName} width={14} height={14} />
                </ChainIconOverlay>
              )}
            </IconWrapper>
          )}
          <Stack direction='column' gap='2px'>
            <PoolName variant='body1'>{pool.asset} Pool</PoolName>
            <ChainName variant='caption'>{pool.chainName}</ChainName>
          </Stack>
        </Stack>
      </PoolHeader>

      <StatsRow>
        <StatColumn>
          <StatLabel>My balance</StatLabel>
          <BalanceValue>{myBalanceTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</BalanceValue>
          <StatSubtext>
            {myBalanceUsd != null ? `$${myBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}
          </StatSubtext>
        </StatColumn>
      </StatsRow>
    </SinglePoolCardContainer>
  );
};

const PendingOnlyCard = ({ pool, hasBorderTop }: { pool: PoolCardData; hasBorderTop?: boolean }) => {
  const router = useRouter();
  const { poolAccountsByChainScope, hasProcessedInitialDeposits } = useAccountContext();

  const dataKey = pool.originalKey || `${pool.chainId}-${pool.scope}`;
  const poolAccounts = poolAccountsByChainScope[dataKey] || [];

  const pending = hasProcessedInitialDeposits
    ? poolAccounts.reduce(
        (sum, pa) => (pa.reviewStatus === ReviewStatus.PENDING ? sum + BigInt(pa.balance || 0) : sum),
        BigInt(0),
      )
    : BigInt(0);

  const pendingFormatted = formatUnits(pending, pool.decimals);
  const pendingTokenAmount = Number(pendingFormatted);

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <SinglePoolCardContainer onClick={handleClick} hasBorderTop={hasBorderTop}>
      {/* Empty header spacer to align with BalanceOnlyCard */}
      <Box sx={{ height: '36px', marginBottom: '12px' }} />

      <StatsRow>
        <StatColumn align='right'>
          <StatLabel>Pending</StatLabel>
          <PendingValue>{pendingTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</PendingValue>
        </StatColumn>
      </StatsRow>
    </SinglePoolCardContainer>
  );
};

const PoolsGridContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  overflow: 'hidden',
}));

const PoolsGrid = styled(Grid)(() => ({
  width: '100%',
  margin: 0,
}));

const PoolCardContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isLeftColumn' && prop !== 'isFirstRow',
})<{ isLeftColumn: boolean; isFirstRow: boolean }>(({ theme, isLeftColumn, isFirstRow }) => ({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '20px',
  gap: '8px',
  borderRight: isLeftColumn ? `1px solid ${theme.palette.grey[600]}` : 'none',
  borderTop: !isFirstRow ? `1px solid ${theme.palette.grey[600]}` : 'none',
  backgroundColor: theme.palette.background.paper,
  minHeight: '131px',
  width: '100%',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: theme.palette.grey[50],
  },
  [theme.breakpoints.down('sm')]: {
    borderRight: 'none',
    borderLeft: 'none',
    borderTop: !(isLeftColumn && isFirstRow) ? `1px solid ${theme.palette.grey[600]}` : 'none',
  },
}));

const SinglePoolCardContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'hasBorderTop',
})<{ hasBorderTop?: boolean }>(({ theme, hasBorderTop }) => ({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '20px',
  gap: '8px',
  backgroundColor: theme.palette.background.paper,
  minHeight: '131px',
  width: '100%',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  borderTop: hasBorderTop ? `1px solid ${theme.palette.grey[600]}` : 'none',
  '&:hover': {
    backgroundColor: theme.palette.grey[50],
  },
}));

const PoolHeader = styled(Stack)(() => ({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  marginBottom: '12px',
}));

const IconWrapper = styled('div')(() => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  '& > img': {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
}));

const ChainIconOverlay = styled('div')(() => ({
  position: 'absolute',
  bottom: -4,
  right: -4,
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  backgroundColor: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #fff',
  overflow: 'hidden',
}));

const PoolName = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '100%',
  color: theme.palette.text.primary,
}));

const ChainName = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#999',
}));

const StatsRow = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
  gap: '16px',
  marginBottom: '8px',
}));

const StatColumn = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'align',
})<{ align?: 'left' | 'right' }>(({ align }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: align === 'right' ? 'flex-end' : 'flex-start',
  gap: '4px',
  flex: 1,
}));

const StatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const StatSubtext = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
  marginTop: '4px',
}));

const BalanceValue = styled(Typography)(() => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '100%',
  color: '#000000',
}));

const PendingValue = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '24px',
  lineHeight: '100%',
  color: '#737373',
}));
