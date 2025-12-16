'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Stack, styled, Theme, Typography } from '@mui/material';
import { useQueries, useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { allPoolsChainData, getConfig } from '~/config';
import { ViewAllButton, ViewAllText } from '~/containers';
import { useAccountContext, useAdvancedView } from '~/hooks';
import { EventType, ReviewStatus } from '~/types';
import { aspClient, ROUTER } from '~/utils';

export const ActivityPreview = () => {
  const { push } = useRouter();
  const { address } = useAccount();
  const { previewGlobalEvents, isLoading } = useAdvancedView();
  const { poolAccountsByChainScope } = useAccountContext();

  const [view, setView] = useState<'global' | 'personal' | 'stats'>('global');

  // Get ASP endpoints for fetching global stats
  const { ASP_ENDPOINT_TEST, ASP_ENDPOINT_NON_TEST } = getConfig().env;

  // Fetch pools-stats from both ASP endpoints (test and non-test)
  const poolStatsQuery = useQueries({
    queries: [
      {
        queryKey: ['asp_pools_stats', 'test', ASP_ENDPOINT_TEST],
        queryFn: () => aspClient.fetchPoolStats(ASP_ENDPOINT_TEST, 'all'),
        refetchInterval: 120000,
        staleTime: 60000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      {
        queryKey: ['asp_pools_stats', 'non_test', ASP_ENDPOINT_NON_TEST],
        queryFn: () => aspClient.fetchPoolStats(ASP_ENDPOINT_NON_TEST, 'all'),
        refetchInterval: 120000,
        staleTime: 60000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ],
  });

  // Fetch global statistics for the Stats tab (All Time + Last 24h)
  const { data: globalStatisticsData } = useQuery({
    queryKey: ['global_statistics', ASP_ENDPOINT_NON_TEST],
    queryFn: () => aspClient.fetchGlobalStatistics(ASP_ENDPOINT_NON_TEST),
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Calculate global stats from all pools
  const globalStats = useMemo(() => {
    let totalTVL = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalDepositedUsd = 0;

    poolStatsQuery.forEach((query) => {
      if (!query.data?.pools) return;

      query.data.pools.forEach((poolStats) => {
        // Get pool info to find decimals
        const chainInfo = allPoolsChainData[poolStats.chainId];
        const poolInfo = chainInfo?.poolInfo.find((p) => p.scope.toString() === poolStats.scope);
        const decimals = poolInfo?.assetDecimals || 18;

        // Parse USD value for TVL - the API returns USD values as strings
        if (poolStats.totalInPoolValueUsd) {
          const parsedUSD = parseFloat(poolStats.totalInPoolValueUsd.replace(/,/g, ''));
          if (!isNaN(parsedUSD)) {
            totalTVL += parsedUSD;
          }
        } else if (poolStats.totalInPoolValue && poolInfo?.isStableAsset) {
          // For stablecoins without USD value, convert token value to USD (1:1)
          totalTVL += Number(formatUnits(BigInt(poolStats.totalInPoolValue), decimals));
        }

        // Sum deposit counts
        totalDeposits += poolStats.acceptedDepositsCount || 0;

        // Sum total deposited USD for withdrawal calculation
        if (poolStats.totalDepositsValueUsd) {
          const parsedDepositUsd = parseFloat(poolStats.totalDepositsValueUsd.replace(/,/g, ''));
          if (!isNaN(parsedDepositUsd)) {
            totalDepositedUsd += parsedDepositUsd;
          }
        } else if (poolStats.totalDepositsValue && poolInfo?.isStableAsset) {
          // For stablecoins without USD value, convert token value to USD (1:1)
          totalDepositedUsd += Number(formatUnits(BigInt(poolStats.totalDepositsValue), decimals));
        }
      });
    });

    // Calculate withdrawals: total deposited - current TVL
    totalWithdrawals = Math.max(0, totalDepositedUsd - totalTVL);

    // Calculate average deposit size in USD
    const averageDepositSize = totalDeposits > 0 ? totalTVL / totalDeposits : 0;

    return {
      tvl: totalTVL,
      averageDepositSize,
      totalDeposits,
      totalWithdrawals,
    };
  }, [poolStatsQuery]);

  // Build ALL personal activity from all pools (not filtered by selectedPoolInfo)
  const allPersonalActivity = useMemo(() => {
    const history = [];

    // Get all pool accounts from all chains/scopes
    for (const poolAccounts of Object.values(poolAccountsByChainScope)) {
      for (const pa of poolAccounts) {
        history.push({
          type: EventType.DEPOSIT,
          txHash: pa.deposit.txHash,
          reviewStatus: pa.reviewStatus,
          amount: pa.deposit.value,
          timestamp: Number(pa.deposit.timestamp),
          label: pa.label,
          scope: pa.scope,
          chainId: pa.chainId,
        });

        for (const [idx, child] of pa.children.entries()) {
          history.push({
            type: EventType.WITHDRAWAL,
            txHash: child.txHash,
            reviewStatus: ReviewStatus.APPROVED,
            amount: (idx === 0 ? pa.deposit.value : pa.children[idx - 1].value) - child.value,
            timestamp: Number(child.timestamp),
            label: child.label,
            scope: pa.scope,
            chainId: pa.chainId,
          });
        }
      }

      for (const { ragequit, scope, chainId } of poolAccounts) {
        if (!ragequit?.transactionHash) continue;
        history.push({
          type: EventType.EXIT,
          txHash: ragequit?.transactionHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: ragequit?.value,
          timestamp: Number(ragequit?.timestamp),
          label: ragequit?.label,
          scope: scope,
          chainId: chainId,
        });
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  }, [poolAccountsByChainScope]);

  const historyData = view === 'global' ? previewGlobalEvents : allPersonalActivity;

  const handleNavigateToPoolAccounts = () => {
    if (view === 'personal') {
      push(ROUTER.activity.children.personal);
    } else {
      push(ROUTER.activity.children.global);
    }
  };

  return (
    <ActivityContainer>
      <Section sx={{ width: '100%' }}>
        <Box>
          <Stack direction='row' alignItems='center' gap={1} sx={{ marginBottom: '1.2rem' }}>
            <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
              Activity
            </Typography>
            <InfoTooltip message='This is a log of all of the global and personal activity in Privacy Pools.' />
          </Stack>

          <Stack spacing='1.2rem' direction='row' alignItems='center'>
            <SButton variant='text' onClick={() => setView('global')} active={String(view === 'global')}>
              Global
            </SButton>

            <Divider />

            <SButton
              variant='text'
              onClick={() => setView('personal')}
              active={String(view === 'personal')}
              disabled={!address}
            >
              Personal
            </SButton>

            <Divider />

            <SButton variant='text' onClick={() => setView('stats')} active={String(view === 'stats')}>
              Stats
            </SButton>
          </Stack>
        </Box>

        {view !== 'stats' && (
          <ViewAllButton onClick={handleNavigateToPoolAccounts} disabled={!historyData?.length}>
            <ViewAllText>View All</ViewAllText>
          </ViewAllButton>
        )}
      </Section>

      {view === 'stats' ? (
        <StatsContainer>
          <StatsColumnsContainer>
            {/* All Time Column */}
            <StatsColumn>
              <StatsColumnHeader>All Time</StatsColumnHeader>
              <StatsGrid>
                <StatItem>
                  <StatLabel>Current TVL</StatLabel>
                  <StatValue>
                    $
                    {(globalStatisticsData?.allTime?.tvlUsd
                      ? parseFloat(globalStatisticsData.allTime.tvlUsd)
                      : globalStats.tvl
                    ).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Avg Deposit Size</StatLabel>
                  <StatValue>
                    $
                    {(globalStatisticsData?.allTime?.avgDepositSizeUsd
                      ? parseFloat(globalStatisticsData.allTime.avgDepositSizeUsd)
                      : globalStats.averageDepositSize
                    ).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Total Deposits</StatLabel>
                  <StatValue>
                    {(globalStatisticsData?.allTime?.totalDepositsCount ?? globalStats.totalDeposits).toLocaleString(
                      'en-US',
                    )}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Total Withdrawals</StatLabel>
                  <StatValue>
                    {(globalStatisticsData?.allTime?.totalWithdrawalsCount || 0).toLocaleString('en-US')}
                  </StatValue>
                </StatItem>
              </StatsGrid>
            </StatsColumn>

            {/* Last 24h Column */}
            <StatsColumn>
              <StatsColumnHeader>Last 24h</StatsColumnHeader>
              <StatsGrid>
                <StatItem>
                  <StatLabel>TVL Change</StatLabel>
                  <StatValue>
                    $
                    {parseFloat(globalStatisticsData?.last24h?.tvlUsd || '0').toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Avg Deposit Size</StatLabel>
                  <StatValue>
                    $
                    {parseFloat(globalStatisticsData?.last24h?.avgDepositSizeUsd || '0').toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Total Deposits</StatLabel>
                  <StatValue>
                    {(globalStatisticsData?.last24h?.totalDepositsCount || 0).toLocaleString('en-US')}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel>Total Withdrawals</StatLabel>
                  <StatValue>
                    {(globalStatisticsData?.last24h?.totalWithdrawalsCount || 0).toLocaleString('en-US')}
                  </StatValue>
                </StatItem>
              </StatsGrid>
            </StatsColumn>
          </StatsColumnsContainer>
        </StatsContainer>
      ) : (
        <ActivityTable records={historyData} isLoading={isLoading} view={view} size='small' />
      )}
    </ActivityContainer>
  );
};

const ActivityContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

const Section = styled(Stack)(() => ({
  padding: '1.6rem',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
}));

const Divider = styled(Box)(({ theme }) => ({
  height: '1.3rem',
  width: '1px',
  background: theme.palette.divider,
}));

const SButton = styled(Button)<{ active: string; theme?: Theme }>(({ theme, active }) => ({
  textTransform: 'none',
  fontWeight: 700,
  padding: '0',
  minWidth: '0',
  width: 'auto',
  height: 'unset',
  lineHeight: '1',
  opacity: active === 'true' ? 1 : 0.2,
  '&.MuiButtonBase-root.MuiButton-root:hover': {
    background: theme.palette.grey[50],
  },
}));

const StatsContainer = styled(Box)(({ theme }) => ({
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  padding: '24px 16px',
}));

const StatsColumnsContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '32px',
  [theme.breakpoints.down('md')]: {
    flexDirection: 'column',
    gap: '24px',
  },
}));

const StatsColumn = styled(Box)(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}));

const StatsColumnHeader = styled(Typography)(() => ({
  fontWeight: 700,
  fontSize: '14px',
  lineHeight: '100%',
  color: '#000000',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
}));

const StatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '24px',
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

const StatItem = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}));

const StatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const StatValue = styled(Typography)(() => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: '#000000',
}));
