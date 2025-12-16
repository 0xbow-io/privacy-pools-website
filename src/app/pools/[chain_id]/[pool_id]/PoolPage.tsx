'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Stack, Typography, Button, styled, Box, IconButton, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { PoolAccountTable, ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { ChainAssets, chainData } from '~/config';
import { Section, PAContainer, ActionMenu, ChainTokenSelectorDropdown } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useChainContext } from '~/hooks';
import { EventType, ModalType, ReviewStatus } from '~/types';
import { ROUTER, aspClient } from '~/utils';

interface PoolPageProps {
  chainId: string;
  poolId: string;
}

// Format large numbers compactly (e.g., 5,550,000 -> 5.55M)
const formatCompactNumber = (num: number, decimals = 2): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(decimals).replace(/\.?0+$/, '') + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(decimals).replace(/\.?0+$/, '') + 'M';
  }
  if (num >= 100_000) {
    return (num / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  }
  return Math.round(num).toLocaleString('en-US');
};

export const PoolPage = ({ chainId, poolId }: PoolPageProps) => {
  const { push } = useRouter();
  const { address } = useAccount();
  const { setChainId, setSelectedAsset, price } = useChainContext();
  const accountContext = useAccountContext();
  const { poolsByAssetAndChain, amountPoolAsset, hideEmptyPools, toggleHideEmptyPools, poolAccountsByChainScope } =
    accountContext;
  const { setModalOpen } = useModal();
  const { isLogged, isConnected, isAuthorized } = useAuthContext();
  const goTo = useGoTo();

  // Get chain name for display
  const parsedChainId = parseInt(chainId, 10);
  const chain = chainData[parsedChainId];

  // Activity view state - default to 'personal' if address exists
  const [activityView, setActivityView] = useState<'global' | 'personal' | 'stats'>(address ? 'personal' : 'global');

  // Fetch pool info for this specific pool
  const currentPoolInfo = useMemo(() => {
    return chain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase());
  }, [poolId, chain]);

  const poolScope = currentPoolInfo?.scope.toString();

  // Use decimals directly from the current pool config to avoid stale context values
  const poolDecimals = currentPoolInfo?.assetDecimals || 18;

  // Get the ASP URL for this chain
  const aspUrl = chainData[parsedChainId]?.aspUrl;

  const { data: poolData } = useQuery({
    queryKey: ['pool_info', parsedChainId, poolScope, aspUrl],
    queryFn: () => aspClient.fetchPoolInfo(aspUrl, parsedChainId, poolScope || ''),
    enabled: !!poolScope && !!aspUrl,
    refetchInterval: 120000, // Increased to 2 minutes
    staleTime: 60000, // Consider data fresh for 60 seconds
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch pool stats to get pendingDepositsValueUsd
  const { data: poolStatsData } = useQuery({
    queryKey: ['pool_stats', parsedChainId, aspUrl],
    queryFn: () => aspClient.fetchPoolStats(aspUrl, parsedChainId),
    enabled: !!poolScope && !!aspUrl,
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch pool-specific events for the activity feed
  const { data: poolEventsData, isLoading: poolEventsLoading } = useQuery({
    queryKey: ['pool_events', parsedChainId, poolScope, aspUrl],
    queryFn: () => aspClient.fetchAllEvents(aspUrl, parsedChainId, poolScope || '', 1, 6),
    enabled: !!poolScope && !!aspUrl,
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch pool statistics for the Stats tab (All Time + Last 24h)
  const { data: poolStatisticsData } = useQuery({
    queryKey: ['pool_statistics', parsedChainId, poolScope, aspUrl],
    queryFn: () => aspClient.fetchPoolStatistics(aspUrl, parsedChainId, poolScope || ''),
    enabled: !!poolScope && !!aspUrl,
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Get the current pool's stats from the pools array
  const currentPoolStats = useMemo(() => {
    if (!poolStatsData?.pools || !poolScope) return null;
    return poolStatsData.pools.find((pool) => pool.scope === poolScope);
  }, [poolStatsData, poolScope]);

  // Calculate stats - token amounts (use poolDecimals directly to avoid stale context)
  const acceptedFundsToken = useMemo(() => {
    if (currentPoolStats?.acceptedDepositsValue) {
      return Number(formatUnits(BigInt(currentPoolStats.acceptedDepositsValue), poolDecimals));
    }
    if (!poolData?.totalInPoolValue) return 0;
    return Number(formatUnits(BigInt(poolData.totalInPoolValue), poolDecimals));
  }, [currentPoolStats, poolData, poolDecimals]);

  const pendingFundsToken = useMemo(() => {
    if (!currentPoolStats?.pendingDepositsValue) return 0;
    return Number(formatUnits(BigInt(currentPoolStats.pendingDepositsValue), poolDecimals));
  }, [currentPoolStats, poolDecimals]);

  const myFundsToken = useMemo(() => {
    if (!isLogged) return 0;
    return Number(formatUnits(amountPoolAsset, poolDecimals));
  }, [isLogged, amountPoolAsset, poolDecimals]);

  const myFundsUsd = useMemo(() => {
    return myFundsToken * (price || 0);
  }, [myFundsToken, price]);

  const acceptedFundsUsd = useMemo(() => {
    return acceptedFundsToken * (price || 0);
  }, [acceptedFundsToken, price]);

  const pendingFundsUsd = useMemo(() => {
    return pendingFundsToken * (price || 0);
  }, [pendingFundsToken, price]);

  const totalDepositsCount = useMemo(() => {
    return currentPoolStats?.totalDepositsCount || 0;
  }, [currentPoolStats]);

  const myPoolAccountsCount = useMemo(() => {
    if (!isLogged || !poolScope) return 0;

    // Use poolAccountsByChainScope to get accounts for this specific pool
    const key = `${parsedChainId}-${poolScope}`;
    const accountsForThisPool = poolAccountsByChainScope[key] || [];

    // Filter out empty pools if hideEmptyPools is true
    if (hideEmptyPools) {
      return accountsForThisPool.filter((pa) => pa.balance && BigInt(pa.balance) > 0n).length;
    }

    return accountsForThisPool.length;
  }, [isLogged, poolAccountsByChainScope, parsedChainId, poolScope, hideEmptyPools]);

  // Filter pool accounts for the current pool only
  const currentPoolAccounts = useMemo(() => {
    if (!isLogged) {
      return [];
    }

    if (!poolScope) {
      return [];
    }

    // Use poolAccountsByChainScope to get accounts for this specific pool
    const key = `${parsedChainId}-${poolScope}`;
    const accountsForThisPool = poolAccountsByChainScope[key] || [];

    // Filter out empty pools if hideEmptyPools is true, then sort by timestamp
    const filtered = hideEmptyPools
      ? accountsForThisPool.filter((pa) => pa.balance && BigInt(pa.balance) > 0n)
      : accountsForThisPool;

    // Sort by deposit timestamp (newest first)
    return [...filtered].sort((a, b) => Number(b.deposit.timestamp || 0) - Number(a.deposit.timestamp || 0));
  }, [isLogged, poolAccountsByChainScope, parsedChainId, poolScope, hideEmptyPools]);

  // Preview pool accounts (first 6 for display in PoolPage)
  const localPreviewPoolAccounts = useMemo(() => currentPoolAccounts.slice(0, 6), [currentPoolAccounts]);

  // Build personal activity for this specific pool from poolAccountsByChainScope
  // (same logic as historyData in AccountProvider but using cached pool accounts)
  const localPersonalActivity = useMemo(() => {
    if (!poolScope) return [];

    const key = `${parsedChainId}-${poolScope}`;
    const accountsForThisPool = poolAccountsByChainScope[key] || [];

    const history = [];

    for (const pa of accountsForThisPool) {
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

    for (const { ragequit, scope, chainId } of accountsForThisPool) {
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

    return history.sort((a, b) => b.timestamp - a.timestamp);
  }, [poolAccountsByChainScope, parsedChainId, poolScope]);

  // Preview personal activity (first 6 for display)
  const localPreviewPersonalActivity = useMemo(() => localPersonalActivity.slice(0, 6), [localPersonalActivity]);

  useEffect(() => {
    // Parse and set the chain ID
    const parsedChainId = parseInt(chainId, 10);
    if (!isNaN(parsedChainId)) {
      setChainId(parsedChainId);
    }

    // Set the selected asset based on pool_id
    // pool_id is expected to be the asset name (e.g., "ETH", "USDC", etc.)
    setSelectedAsset(poolId.toUpperCase() as ChainAssets);
  }, [chainId, poolId, setChainId, setSelectedAsset]);

  const handleShowEmptyPools = () => {
    toggleHideEmptyPools();
  };

  const handleLogin = () => {
    goTo(ROUTER.account.base);
  };

  const handleConnect = () => {
    setModalOpen(ModalType.CONNECT);
  };

  const handleNavigateToPoolAccounts = () => {
    push(ROUTER.poolAccounts.base);
  };

  const handleNavigateToActivity = () => {
    if (activityView === 'personal') {
      push(ROUTER.activity.children.personal);
    } else {
      push(ROUTER.activity.children.global);
    }
  };

  // Update activity view to 'personal' when address becomes available

  // Pool events are already in the correct format from the API
  const poolActivityEvents = poolEventsData?.events || [];

  const activityData = activityView === 'global' ? poolActivityEvents : localPreviewPersonalActivity;

  return (
    <PoolPageContainer>
      <PAContainer>
        <Section width='100%'>
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            width='100%'
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={1}
              width='100%'
            >
              <Stack direction='row' alignItems='center' gap={0}>
                <BackButton onClick={() => push('/')}>
                  <svg width='6' height='10' viewBox='0 0 6 10' fill='none' xmlns='http://www.w3.org/2000/svg'>
                    <path d='M0 5L5 0L5.7 0.7L1.4 5L5.7 9.3L5 10L0 5Z' fill='black' />
                  </svg>
                </BackButton>
                <PoolAssetSelect chainId={parsedChainId} poolId={poolId} />
              </Stack>
            </Stack>

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              alignItems={{ xs: 'flex-end', sm: 'center' }}
              gap={1}
              width='100%'
              justifyContent='flex-end'
            >
              {localPreviewPoolAccounts.length > 0 && (
                <ViewAllButton onClick={handleShowEmptyPools} disabled={!poolsByAssetAndChain?.length}>
                  <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty accounts</ViewAllText>
                </ViewAllButton>
              )}

              {isAuthorized && localPreviewPoolAccounts.length > 0 && (
                <ViewAllButton
                  onClick={handleNavigateToPoolAccounts}
                  disabled={poolsByAssetAndChain && !poolsByAssetAndChain.length}
                >
                  <ViewAllText>View All</ViewAllText>
                </ViewAllButton>
              )}
            </Stack>
          </Stack>
        </Section>

        {/* Stats Section */}
        <StatsContainer>
          <Grid container>
            <StatsColumn item xs={12} sm={2.4}>
              <StatLabel>Accepted Funds</StatLabel>
              <StatValue>
                {formatCompactNumber(acceptedFundsToken)} {currentPoolInfo?.asset}
              </StatValue>
              <StatSubtext>${formatCompactNumber(acceptedFundsUsd)}</StatSubtext>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <StatLabel>Pending Funds</StatLabel>
              <StatValue>
                {formatCompactNumber(pendingFundsToken)} {currentPoolInfo?.asset}
              </StatValue>
              <StatSubtext>${formatCompactNumber(pendingFundsUsd)}</StatSubtext>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <StatLabel>Total Deposits</StatLabel>
              <StatValue>{formatCompactNumber(totalDepositsCount)}</StatValue>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <StatLabel>My Funds</StatLabel>
              <StatValue>
                {formatCompactNumber(myFundsToken)} {currentPoolInfo?.asset}
              </StatValue>
              <StatSubtext>${formatCompactNumber(myFundsUsd)}</StatSubtext>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4} isLast>
              <StatLabel>My Pool Accounts</StatLabel>
              <StatValue>{myPoolAccountsCount}</StatValue>
            </StatsColumn>
          </Grid>
        </StatsContainer>

        {/* Pool Accounts Table */}
        {isLogged && (
          <PAContainer id='lalala' style={{ borderRight: '0', borderBottom: '0', borderLeft: '0' }}>
            {currentPoolAccounts.length > 0 && (
              <>
                <Section width='100%' id='foo'>
                  <Stack
                    direction='row'
                    alignItems='center'
                    gap={1}
                    width='100%'
                    style={{ borderRight: '0px' }}
                    id='lol'
                  >
                    <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
                      My Pool Accounts
                    </Typography>
                    <Typography variant='caption' fontWeight='bold' mt='0.2rem'>
                      ({currentPoolAccounts.length})
                    </Typography>
                  </Stack>
                </Section>
                <PoolAccountTable records={currentPoolAccounts} />
              </>
            )}
            <ActionMenuContainer>
              <ActionMenu />
            </ActionMenuContainer>
          </PAContainer>
        )}

        {!isConnected && (
          <ConnectContainer sx={{ minHeight: '13.2rem' }}>
            <Stack
              padding='1rem'
              width='100%'
              flexDirection={['column', 'row']}
              justifyContent='center'
              alignItems='center'
              gap='0.6rem'
            >
              <ConnectText variant='caption' onClick={handleConnect}>
                Connect Wallet
              </ConnectText>
              <STypography variant='caption'>to Sign in and Deposit</STypography>
            </Stack>
          </ConnectContainer>
        )}

        {isConnected && !isLogged && (
          <ConnectContainer sx={{ minHeight: '13.2rem' }}>
            <Stack
              padding='1rem'
              width='100%'
              flexDirection={['column', 'row']}
              justifyContent='center'
              gap='0.6rem'
              alignItems='center'
            >
              <ConnectText variant='caption' onClick={handleLogin}>
                Create or Load
              </ConnectText>
              <STypography variant='caption'>an Account</STypography>
            </Stack>
          </ConnectContainer>
        )}
      </PAContainer>

      {/* Activity Section */}
      <ActivityContainer>
        <ActivitySection sx={{ width: '100%' }}>
          <Box sx={{ width: '100%' }}>
            <Stack direction='row' alignItems='center' gap={1} sx={{ marginBottom: '1.2rem' }}>
              <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
                Activity
              </Typography>
              <InfoTooltip message='This is a log of all of the global and personal activity in Privacy Pools.' />
            </Stack>

            <Stack direction='row' alignItems='center' justifyContent='space-between' width='100%'>
              <Stack spacing='1.2rem' direction='row' alignItems='center'>
                <ActivityButton
                  variant='text'
                  onClick={() => setActivityView('global')}
                  active={String(activityView === 'global')}
                >
                  Global
                </ActivityButton>

                <ActivityDivider />

                <ActivityButton
                  variant='text'
                  onClick={() => setActivityView('personal')}
                  active={String(activityView === 'personal')}
                  disabled={!address}
                >
                  Personal
                </ActivityButton>

                <ActivityDivider />

                <ActivityButton
                  variant='text'
                  onClick={() => setActivityView('stats')}
                  active={String(activityView === 'stats')}
                >
                  Stats
                </ActivityButton>
              </Stack>

              {activityView !== 'stats' && (
                <ViewAllButton onClick={handleNavigateToActivity} disabled={!activityData?.length}>
                  <ViewAllText>View All</ViewAllText>
                </ViewAllButton>
              )}
            </Stack>
          </Box>
        </ActivitySection>

        {activityView === 'stats' ? (
          <ActivityStatsContainer>
            <StatsColumnsContainer>
              {/* All Time Column */}
              <ActivityStatsColumn>
                <StatsColumnHeader>All Time</StatsColumnHeader>
                <ActivityStatsGrid>
                  <ActivityStatItem>
                    <ActivityStatLabel>Current TVL</ActivityStatLabel>
                    <ActivityStatValue>
                      $
                      {parseFloat(poolStatisticsData?.pool?.allTime?.tvlUsd || '0').toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Avg Deposit Size</ActivityStatLabel>
                    <ActivityStatValue>
                      $
                      {parseFloat(poolStatisticsData?.pool?.allTime?.avgDepositSizeUsd || '0').toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Total Deposits</ActivityStatLabel>
                    <ActivityStatValue>
                      {(poolStatisticsData?.pool?.allTime?.totalDepositsCount || 0).toLocaleString('en-US')}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Total Withdrawals</ActivityStatLabel>
                    <ActivityStatValue>
                      {(poolStatisticsData?.pool?.allTime?.totalWithdrawalsCount || 0).toLocaleString('en-US')}
                    </ActivityStatValue>
                  </ActivityStatItem>
                </ActivityStatsGrid>
              </ActivityStatsColumn>

              {/* Last 24h Column */}
              <ActivityStatsColumn>
                <StatsColumnHeader>Last 24h</StatsColumnHeader>
                <ActivityStatsGrid>
                  <ActivityStatItem>
                    <ActivityStatLabel>TVL Change</ActivityStatLabel>
                    <ActivityStatValue>
                      $
                      {parseFloat(poolStatisticsData?.pool?.last24h?.tvlUsd || '0').toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Avg Deposit Size</ActivityStatLabel>
                    <ActivityStatValue>
                      $
                      {parseFloat(poolStatisticsData?.pool?.last24h?.avgDepositSizeUsd || '0').toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Total Deposits</ActivityStatLabel>
                    <ActivityStatValue>
                      {(poolStatisticsData?.pool?.last24h?.totalDepositsCount || 0).toLocaleString('en-US')}
                    </ActivityStatValue>
                  </ActivityStatItem>
                  <ActivityStatItem>
                    <ActivityStatLabel>Total Withdrawals</ActivityStatLabel>
                    <ActivityStatValue>
                      {(poolStatisticsData?.pool?.last24h?.totalWithdrawalsCount || 0).toLocaleString('en-US')}
                    </ActivityStatValue>
                  </ActivityStatItem>
                </ActivityStatsGrid>
              </ActivityStatsColumn>
            </StatsColumnsContainer>
          </ActivityStatsContainer>
        ) : (
          <ActivityTable records={activityData} isLoading={poolEventsLoading} view={activityView} size='small' />
        )}
      </ActivityContainer>
    </PoolPageContainer>
  );
};

// Custom Pool Asset Select Component with two-level selection (Chain -> Token)
const PoolAssetSelect = ({ chainId, poolId }: { chainId: number; poolId: string }) => {
  const router = useRouter();
  const { setSelectedAsset } = useChainContext();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get current selection info
  const currentChain = chainData[chainId];
  const currentPool = currentChain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase());

  const handleToggle = () => {
    if (anchorEl) {
      setAnchorEl(null);
    } else {
      setAnchorEl(buttonRef.current);
    }
  };

  const handleSelect = (newChainId: number, asset: string) => {
    setSelectedAsset(asset as ChainAssets);
    router.push(`/pools/${newChainId}/${asset.toLowerCase()}`);
  };

  return (
    <PoolSelectorContainer>
      <PoolSelectorButton ref={buttonRef} onClick={handleToggle}>
        {currentPool?.icon && (
          <PoolIconWrapper>
            <Image src={currentPool.icon} alt={currentPool.asset} width={24} height={24} />
          </PoolIconWrapper>
        )}
        <span style={{ fontWeight: 600, fontSize: '16px' }}>
          {currentPool?.asset}
          <ChainNameText>@{currentChain?.name}</ChainNameText>
        </span>
        <Typography variant='subtitle1' fontWeight='bold' lineHeight='1' sx={{ ml: '4px', whiteSpace: 'nowrap' }}>
          Pool
        </Typography>
        <DropdownArrow open={!!anchorEl}>
          <svg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M1 1.5L6 6.5L11 1.5'
              stroke='black'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        </DropdownArrow>
      </PoolSelectorButton>

      <ChainTokenSelectorDropdown
        selectedChainId={chainId}
        selectedAsset={currentPool?.asset || ''}
        onSelect={handleSelect}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
      />
    </PoolSelectorContainer>
  );
};

const BackButton = styled(IconButton)(() => ({
  padding: '11px 15px 11px 11px',
  width: '32px',
  height: '32px',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: 'none',
  },
  '&:focus': {
    border: 'none',
  },
}));

// Pool selector styled components
const PoolSelectorContainer = styled('div')(() => ({
  position: 'relative',
  display: 'inline-block',
}));

const PoolSelectorButton = styled('button')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
}));

const DropdownArrow = styled('span', {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open: boolean }>(({ open }) => ({
  display: 'flex',
  alignItems: 'center',
  marginLeft: '4px',
  transition: 'transform 0.2s',
  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
}));

const PoolIconWrapper = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  flexShrink: 0,
}));

const ChainNameText = styled('span')(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 400,
  lineHeight: '1.25',
}));

const PoolPageContainer = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  gap: '2.4rem',
  marginTop: '2rem',
}));

const StatsContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  padding: '20px 0',
}));

const StatsColumn = styled(Grid, {
  shouldForwardProp: (prop) => prop !== 'isLast',
})<{ isLast?: boolean }>(({ theme, isLast }) => ({
  padding: '0 24px',
  borderRight: !isLast ? '1px solid #999999' : 'none',
  [theme.breakpoints.down('sm')]: {
    borderRight: 'none',
    borderBottom: !isLast ? '1px solid #999999' : 'none',
    padding: '16px 24px',
  },
}));

const StatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '12px',
  color: '#4D4D4D',
  marginBottom: '8px',
}));

const StatValue = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: '#000000',
  marginBottom: '8px',
  [theme.breakpoints.between(600, 850)]: {
    fontSize: '18px',
    lineHeight: '24px',
  },
  [theme.breakpoints.between(400, 656)]: {
    fontSize: '16px',
    lineHeight: '22px',
  },
}));

const StatSubtext = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const ConnectContainer = styled(Box)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}));

const ActionMenuContainer = styled(Box)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.6rem',
  gap: '1.6rem',
}));

const ActivityContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

const ActivitySection = styled(Stack)(() => ({
  padding: '1.6rem',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
}));

const ActivityDivider = styled(Box)(({ theme }) => ({
  height: '1.3rem',
  width: '1px',
  background: theme.palette.divider,
}));

const ActivityButton = styled(Button)<{ active: string }>(({ theme, active }) => ({
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

const ActivityStatsContainer = styled(Box)(({ theme }) => ({
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

const ActivityStatsColumn = styled(Box)(() => ({
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

const ActivityStatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '24px',
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

const ActivityStatItem = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}));

const ActivityStatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const ActivityStatValue = styled(Typography)(() => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: '#000000',
}));

const STypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 400,
  lineHeight: '1.25',
}));

export const ViewAllText = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textUnderlineOffset: '0.3rem',
  textDecorationColor: theme.palette.grey[400],
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: '1.2rem',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));

const ConnectText = styled(STypography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '0.3rem',
  lineHeight: '1.25',
  cursor: 'pointer',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));

export const ViewAllButton = styled(Button)(({ theme }) => ({
  border: 'none',
  background: 'none',
  padding: 0,
  height: 'unset',
  '&:hover': {
    border: 'none',
    background: 'none',
  },
  '&:focus': {
    background: 'none',
    border: 'none',
  },
  '&:disabled': {
    background: 'none',
    border: 'none',
  },
  '&:hover, &:focus': {
    color: theme.palette.grey[900],
  },
}));
