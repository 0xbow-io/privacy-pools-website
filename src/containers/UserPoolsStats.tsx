'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Box, Grid, Stack, styled, Typography } from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { InfoTooltip } from '~/components/InfoTooltip';
import { chainData, getConfig, PoolInfo } from '~/config';
import { useAccountContext } from '~/hooks';
import { ReviewStatus, type PoolResponse } from '~/types';
import { aspClient } from '~/utils';
import { calculateDepositVarianceScore, PoolCardData } from './AllPoolsStats';

export const UserPoolsStats = () => {
  const aspUrl = getConfig().env.ASP_ENDPOINT;
  const { poolAccountsByChainScope } = useAccountContext();

  // Get unique pool combinations from user's pool accounts (across all chains/scopes)
  const userPoolsToQuery = useMemo(() => {
    const uniquePools = new Map<string, { chainId: number; scope: string; poolInfo: PoolInfo }>();

    // Iterate through all cached pool accounts from all chains/scopes
    for (const [key, poolAccounts] of Object.entries(poolAccountsByChainScope)) {
      if (!poolAccounts || poolAccounts.length === 0) continue;

      // Get the first account to extract chain and scope info
      const firstAccount = poolAccounts[0];
      const chain = chainData[firstAccount.chainId];
      if (!chain) continue;

      const poolInfo = chain.poolInfo.find((p) => p.scope.toString() === firstAccount.scope.toString());
      if (!poolInfo) continue;

      if (!uniquePools.has(key)) {
        uniquePools.set(key, {
          chainId: firstAccount.chainId,
          scope: firstAccount.scope.toString(),
          poolInfo,
        });
      }
    }

    return Array.from(uniquePools.values()).map((pool) => ({
      ...pool,
      aspUrl,
    }));
  }, [poolAccountsByChainScope, aspUrl]);

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
    queries: uniqueChainIds.map((chainId) => ({
      queryKey: ['user_pools_stats', chainId, aspUrl],
      queryFn: () => aspClient.fetchPoolStats(aspUrl, chainId),
      refetchInterval: 120000,
      staleTime: 60000,
      retryOnMount: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

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
        scope: poolToQuery.scope,
        totalFunds,
        fundsPending: BigInt(0),
        decimals: poolToQuery.poolInfo.assetDecimals || 18,
        growthPercentage: poolData?.growth24h ?? undefined,
        acceptedDepositsCount: poolData?.acceptedDepositsCount || 0,
        depositVarianceScore: calculateDepositVarianceScore(poolData),
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
        {userPools.map((pool, index) => (
          <Grid item xs={12} sm={userPools.length === 1 ? 12 : 6} key={`${pool.chainId}-${pool.scope}-${index}`}>
            <PoolCard pool={pool} isLeftColumn={index % 2 === 0} isFirstRow={index < 2} />
          </Grid>
        ))}
      </PoolsGrid>
    </PoolsGridContainer>
  );
};

const PoolCard = ({
  pool,
  isLeftColumn,
  isFirstRow,
}: {
  pool: PoolCardData;
  isLeftColumn: boolean;
  isFirstRow: boolean;
}) => {
  const router = useRouter();
  const { poolAccountsByChainScope } = useAccountContext();

  const dataKey = `${pool.chainId}-${pool.scope}`;
  const poolAccounts = poolAccountsByChainScope[dataKey] || [];

  // Calculate my balance (sum of all balances for this pool)
  const myBalance = poolAccounts.reduce((sum, pa) => sum + BigInt(pa.balance || 0), BigInt(0));
  const myBalanceFormatted = formatUnits(myBalance, pool.decimals);

  // Calculate pending (sum of balances where reviewStatus is PENDING)
  const pending = poolAccounts.reduce(
    (sum, pa) => (pa.reviewStatus === ReviewStatus.PENDING ? sum + BigInt(pa.balance || 0) : sum),
    BigInt(0),
  );
  const pendingFormatted = formatUnits(pending, pool.decimals);

  // My Accounts count
  const myAccountsCount = poolAccounts.length;

  // Total Funds in Pool
  const totalFundsFormatted = formatUnits(pool.totalFunds, pool.decimals);

  // Calculate Average Deposit Size
  const averageDepositSize =
    pool.acceptedDepositsCount > 0 ? Number(totalFundsFormatted) / pool.acceptedDepositsCount : 0;

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
            </IconWrapper>
          )}
          <PoolName variant='body1'>{pool.asset} Pool</PoolName>
        </Stack>
      </PoolHeader>

      <StatsRow>
        <StatColumn>
          <StatLabel>My balance</StatLabel>
          <Stack direction='row' alignItems='center' gap='4px'>
            <BalanceValue>${Number(myBalanceFormatted).toLocaleString()}</BalanceValue>
            <InfoTooltip message='Your total balance in this pool' iconWidth={16} iconHeight={16} />
          </Stack>
        </StatColumn>
        <StatColumn align='right'>
          <StatLabel>Pending</StatLabel>
          <PendingValue>${Number(pendingFormatted).toLocaleString()}</PendingValue>
        </StatColumn>
      </StatsRow>

      <Separator />

      <InfoStatsRow>
        <StatLabel>My Accounts</StatLabel>
        <SmallStatValue>{myAccountsCount}</SmallStatValue>
      </InfoStatsRow>

      <InfoStatsRow>
        <StatLabel>Total Funds in Pool</StatLabel>
        <SmallStatValue>${Number(totalFundsFormatted).toLocaleString()}</SmallStatValue>
      </InfoStatsRow>

      <InfoStatsRow>
        <StatLabel>Average Deposit Size</StatLabel>
        <SmallStatValue>${averageDepositSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</SmallStatValue>
      </InfoStatsRow>

      <InfoStatsRow>
        <StatLabel>Total Accounts</StatLabel>
        <SmallStatValue>{pool.acceptedDepositsCount.toLocaleString()}</SmallStatValue>
      </InfoStatsRow>
    </PoolCardContainer>
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

const PoolHeader = styled(Stack)(() => ({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  marginBottom: '12px',
}));

const IconWrapper = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
}));

const PoolName = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '100%',
  color: theme.palette.text.primary,
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

const InfoStatsRow = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  marginBottom: '4px',
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

const SmallStatValue = styled(Typography)(() => ({
  fontStyle: 'normal',
  fontWeight: 700,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const Separator = styled(Box)(() => ({
  width: '100%',
  height: '1px',
  border: '1px solid #E6E6E6',
  marginBottom: '8px',
}));
