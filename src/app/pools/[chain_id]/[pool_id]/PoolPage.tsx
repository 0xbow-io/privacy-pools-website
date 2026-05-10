'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Stack, Typography, Button, styled, Box, IconButton, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { PoolAccountTable, ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { ChainAssets, chainData } from '~/config';
import { ibm_plex_mono } from '~/config/fonts';
import { Section, PAContainer, ActionMenu, ChainTokenSelectorDropdown } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useChainContext } from '~/hooks';
import { AllEventsResponse, ModalType, ReviewStatus } from '~/types';
import { ROUTER, aspClient, fetchFxnPrice } from '~/utils';

interface PoolPageProps {
  chainId: string;
  poolId: string;
}

// Incentives timeline configuration
const FXUSD_INCENTIVES_CONFIG = {
  startTimestamp: new Date('2025-12-22T16:30:35Z').getTime(), // Block 24069356
  epochDurationDays: 30,
  totalEpochs: 3,
  fxnPerEpoch: 75, // 75 FXN distributed per epoch
};

// Calculate incentives timeline progress
const calculateIncentivesTimeline = () => {
  const { startTimestamp, epochDurationDays, totalEpochs } = FXUSD_INCENTIVES_CONFIG;
  const totalDays = epochDurationDays * totalEpochs;
  const totalDurationMs = totalDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const elapsedMs = Math.max(0, now - startTimestamp);
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  // Cap at 100% if past end date
  const progress = Math.min(100, (elapsedMs / totalDurationMs) * 100);
  const currentDay = Math.min(totalDays, Math.floor(elapsedDays) + 1);
  const currentEpoch = Math.min(totalEpochs, Math.floor(elapsedDays / epochDurationDays) + 1);
  const daysRemaining = Math.max(0, Math.ceil(totalDays - elapsedDays));

  return {
    progress,
    currentDay,
    totalDays,
    currentEpoch,
    totalEpochs,
    daysRemaining,
  };
};

// Format large numbers compactly (e.g., 5,550,000 -> 5.55M)
const formatCompactNumber = (num: number, decimals = 2): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(decimals).replace(/\.?0+$/, '') + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(decimals).replace(/\.?0+$/, '') + 'M';
  }
  return Math.round(num).toLocaleString('en-US');
};

// Helper to enhance pool events with Brevis statuses if the pool uses Brevis ASP
const enhancePoolEventsWithBrevisStatuses = async (
  eventsResponse: AllEventsResponse | undefined,
  poolInfo: (typeof chainData)[number]['poolInfo'][number] | undefined,
): Promise<AllEventsResponse | undefined> => {
  if (!eventsResponse?.events || !poolInfo?.externalAsp) return eventsResponse;

  const { externalAsp } = poolInfo;
  if (externalAsp.provider !== 'brevis') return eventsResponse;

  // Get deposit events that need status lookup
  const deposits = eventsResponse.events.filter((e) => e.type === 'deposit' && e.txHash);

  if (deposits.length === 0) return eventsResponse;

  try {
    // Fetch all deposits from Brevis for this pool
    const response = await aspClient.fetchBrevisAllDeposits(externalAsp.baseUrl, {
      page_size: 250,
      page: 1,
      sort: 1,
      pool_address: [externalAsp.poolAddress],
    });

    // Build txHash -> status map
    const statusMap: Record<string, ReviewStatus> = {};

    if (response.err === null && response.depositInfo) {
      for (const deposit of response.depositInfo) {
        if (deposit.reviewStatus != null && deposit.txHash != null) {
          const status = deposit.reviewStatus.toUpperCase() as keyof typeof ReviewStatus;
          if (status in ReviewStatus) {
            statusMap[deposit.txHash.toLowerCase()] = ReviewStatus[status];
          }
        }
      }
    }

    // Merge statuses into events
    const enhancedEvents = eventsResponse.events.map((event) => {
      if (event.type !== 'deposit' || !event.txHash) return event;

      const status = statusMap[event.txHash.toLowerCase()];
      if (status) {
        return { ...event, reviewStatus: status };
      }

      return event;
    });

    return { ...eventsResponse, events: enhancedEvents };
  } catch (error) {
    console.error('Error fetching Brevis statuses for pool events:', error);
  }

  return eventsResponse;
};

export const PoolPage = ({ chainId, poolId }: PoolPageProps) => {
  const { push } = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: 1 }); // Mainnet for Uniswap FXN price
  const { setChainId, setSelectedAsset, price } = useChainContext();
  const accountContext = useAccountContext();
  const {
    poolsByAssetAndChain,
    amountPoolAsset,
    hideEmptyPools,
    toggleHideEmptyPools,
    poolAccountsByChainScope,
    historyData,
  } = accountContext;
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
    queryKey: ['pool_events', parsedChainId, poolScope, aspUrl, currentPoolInfo?.externalAsp?.provider],
    queryFn: async () => {
      const response = await aspClient.fetchAllEvents(aspUrl, parsedChainId, poolScope || '', 1, 6);
      // Enhance with Brevis statuses if this pool uses Brevis ASP
      return enhancePoolEventsWithBrevisStatuses(response, currentPoolInfo);
    },
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

  // If the chain context can't supply a live price (Alchemy doesn't list the
  // token, on-chain conversion failed, etc.), derive one from the pool stats
  // returned by the ASP. This is more accurate than a fixed $1 fallback for
  // yield-bearing assets like sUSDS/yUSND, which trade above $1 because of
  // accrued yield.
  const derivedPriceFromStats = useMemo(() => {
    const usdStr = currentPoolStats?.acceptedDepositsValueUsd ?? currentPoolStats?.totalInPoolValueUsd;
    const tokensStr = currentPoolStats?.acceptedDepositsValue ?? currentPoolStats?.totalInPoolValue;
    if (!usdStr || !tokensStr) return null;
    const usd = parseFloat(String(usdStr).replace(/,/g, ''));
    if (!Number.isFinite(usd) || usd <= 0) return null;
    let tokens: number;
    try {
      tokens = Number(formatUnits(BigInt(tokensStr), poolDecimals));
    } catch {
      return null;
    }
    if (tokens <= 0) return null;
    return usd / tokens;
  }, [currentPoolStats, poolDecimals]);

  const effectivePrice = price ?? derivedPriceFromStats;

  const myFundsUsd = useMemo(() => {
    return effectivePrice ? myFundsToken * effectivePrice : null;
  }, [myFundsToken, effectivePrice]);

  const acceptedFundsUsd = useMemo(() => {
    return effectivePrice ? acceptedFundsToken * effectivePrice : null;
  }, [acceptedFundsToken, effectivePrice]);

  const pendingFundsUsd = useMemo(() => {
    return effectivePrice ? pendingFundsToken * effectivePrice : null;
  }, [pendingFundsToken, effectivePrice]);

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

  const localPersonalActivity = useMemo(() => {
    if (!currentPoolInfo?.scope) return [];
    return historyData.filter((event) => event.scope === currentPoolInfo.scope && event.chainId === parsedChainId);
  }, [historyData, parsedChainId, currentPoolInfo?.scope]);

  // Preview personal activity (first 6 for display)
  const localPreviewPersonalActivity = useMemo(() => localPersonalActivity.slice(0, 6), [localPersonalActivity]);

  // Calculate incentives timeline for fxUSD pool
  const incentivesTimeline = useMemo(() => {
    if (currentPoolInfo?.asset !== 'fxUSD') return null;
    return calculateIncentivesTimeline();
  }, [currentPoolInfo?.asset]);

  // Fetch FXN price for incentives calculation from Uniswap V3
  const { data: fxnPrice } = useQuery({
    queryKey: ['fxn_price'],
    queryFn: () => fetchFxnPrice(publicClient!),
    enabled: currentPoolInfo?.asset === 'fxUSD' && !!publicClient,
    staleTime: 300000, // 5 minutes
    refetchInterval: 300000,
  });

  // Calculate user's earned FXN incentives using time-weighted share
  // This accounts for when each deposit was made relative to program start
  const userEarnedFxn = useMemo(() => {
    if (!incentivesTimeline || !isLogged || !acceptedFundsUsd) {
      return { amount: 0, usdValue: 0 };
    }

    const { fxnPerEpoch, epochDurationDays, totalEpochs, startTimestamp } = FXUSD_INCENTIVES_CONFIG;
    const now = Date.now();
    const programEndTimestamp = startTimestamp + totalEpochs * epochDurationDays * 24 * 60 * 60 * 1000;
    const cappedNow = Math.min(now, programEndTimestamp);
    const totalProgramElapsedMs = Math.max(0, cappedNow - startTimestamp);

    // If program hasn't started yet, no rewards
    if (totalProgramElapsedMs === 0) {
      return { amount: 0, usdValue: 0 };
    }

    // Calculate time-weighted deposit contribution for each user deposit
    // For each deposit: contribution = depositAmount * timeInProgram
    // timeInProgram = cappedNow - max(depositTimestamp, programStartTimestamp)
    let userTimeWeightedContribution = 0;

    for (const account of currentPoolAccounts) {
      const depositTimestampMs = Number(account.deposit.timestamp) * 1000; // Convert seconds to ms
      const balanceToken = Number(formatUnits(BigInt(account.balance || '0'), poolDecimals));

      // Only count deposits with non-zero balance that were accepted (approved status)
      if (balanceToken <= 0 || account.reviewStatus !== ReviewStatus.APPROVED) {
        continue;
      }

      // Deposit only earns from when it joined (or program start if earlier)
      const participationStart = Math.max(depositTimestampMs, startTimestamp);
      const participationEnd = cappedNow;
      const participationTimeMs = Math.max(0, participationEnd - participationStart);

      // Contribution = balance * time participated (in USD terms for weighting)
      const balanceUsd = balanceToken * (effectivePrice ?? 0);
      userTimeWeightedContribution += balanceUsd * participationTimeMs;
    }

    // If user has no time-weighted contribution, return 0
    if (userTimeWeightedContribution === 0) {
      return { amount: 0, usdValue: 0 };
    }

    // Total pool's time-weighted contribution (simplified: assumes pool TVL was constant)
    // In reality, we'd need historical TVL data for perfect accuracy
    // This approximation uses: totalPoolUsd * totalProgramElapsedTime
    const totalPoolTimeWeightedContribution = acceptedFundsUsd * totalProgramElapsedMs;

    // User's time-weighted share of the pool
    const userTimeWeightedShare = userTimeWeightedContribution / totalPoolTimeWeightedContribution;

    // Total FXN distributed so far (pro-rata based on elapsed time)
    const totalFxn = fxnPerEpoch * totalEpochs; // 225 FXN total
    const totalDays = epochDurationDays * totalEpochs;
    const elapsedDays = totalProgramElapsedMs / (24 * 60 * 60 * 1000);
    const fxnDistributedSoFar = totalFxn * Math.min(1, elapsedDays / totalDays);

    // User's earned FXN
    const earnedFxn = userTimeWeightedShare * fxnDistributedSoFar;

    const usdValue = earnedFxn * (fxnPrice || 0);

    return {
      amount: earnedFxn,
      usdValue,
    };
  }, [incentivesTimeline, isLogged, acceptedFundsUsd, currentPoolAccounts, poolDecimals, effectivePrice, fxnPrice]);

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
    const params = new URLSearchParams({ chainId: chainId, pool: poolId });
    if (activityView === 'personal') {
      push(`${ROUTER.activity.children.personal}?${params.toString()}`);
    } else {
      push(`${ROUTER.activity.children.global}?${params.toString()}`);
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
              <AcceptedFundsLabel>Accepted Funds</AcceptedFundsLabel>
              <AcceptedFundsValue>
                {acceptedFundsUsd != null ? `$${formatCompactNumber(acceptedFundsUsd)}` : '-'}
              </AcceptedFundsValue>
              <AcceptedFundsTokenAmount>
                {formatCompactNumber(acceptedFundsToken)} {currentPoolInfo?.asset}
              </AcceptedFundsTokenAmount>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <AcceptedFundsLabel>Pending Funds</AcceptedFundsLabel>
              <AcceptedFundsValue>
                {pendingFundsUsd != null ? `$${formatCompactNumber(pendingFundsUsd)}` : '-'}
              </AcceptedFundsValue>
              <AcceptedFundsTokenAmount>
                {formatCompactNumber(pendingFundsToken)} {currentPoolInfo?.asset}
              </AcceptedFundsTokenAmount>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <AcceptedFundsLabel>Total Deposits</AcceptedFundsLabel>
              <AcceptedFundsValue>{formatCompactNumber(totalDepositsCount)}</AcceptedFundsValue>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4}>
              <AcceptedFundsLabel>My Funds</AcceptedFundsLabel>
              <AcceptedFundsValue>
                {myFundsUsd != null ? `$${formatCompactNumber(myFundsUsd)}` : '-'}
              </AcceptedFundsValue>
              <AcceptedFundsTokenAmount>
                {formatCompactNumber(myFundsToken)} {currentPoolInfo?.asset}
              </AcceptedFundsTokenAmount>
            </StatsColumn>

            <StatsColumn item xs={12} sm={2.4} isLast>
              <AcceptedFundsLabel>My Pool Accounts</AcceptedFundsLabel>
              <AcceptedFundsValue>{myPoolAccountsCount}</AcceptedFundsValue>
            </StatsColumn>
          </Grid>
        </StatsContainer>

        {/* Incentives Section - Only for fxUSD */}
        {currentPoolInfo?.asset === 'fxUSD' && (
          <IncentivesSection>
            <IncentivesRow>
              {/* Left Block - Incentives Amount */}
              <IncentivesBlock>
                <IncentivesLabel>Incentives</IncentivesLabel>
                <IncentivesValueRow>
                  <IncentivesValue>
                    {userEarnedFxn.amount > 0 ? userEarnedFxn.amount.toFixed(2) : '0'} FXN
                  </IncentivesValue>
                  {isLogged && userEarnedFxn.amount > 0 && (
                    <ClaimButton
                      href='https://fx.aladdin.club/v2/privacy-pool'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Click to Claim
                    </ClaimButton>
                  )}
                </IncentivesValueRow>
                <IncentivesSubtext>
                  ${userEarnedFxn.usdValue > 0 ? userEarnedFxn.usdValue.toFixed(2) : '0.00'}
                </IncentivesSubtext>
              </IncentivesBlock>

              <IncentivesDivider />

              {/* Right Block - Timeline */}
              <IncentivesBlock>
                <TimelineHeader>
                  <TimelineLabel>Incentives Timeline</TimelineLabel>
                  <InfoTooltip
                    message='Timeline for incentive distribution epochs. Rewards may roll over if TVL is below $200k.'
                    iconWidth={12}
                    iconHeight={12}
                  />
                  <TimelineDays>
                    Day {incentivesTimeline?.currentDay}/{incentivesTimeline?.totalDays}
                  </TimelineDays>
                </TimelineHeader>
                <TimelineContent>
                  <EpochProgressBar progress={incentivesTimeline?.progress ?? 0} epochs={3} />
                  <TimelineFooter>
                    <TimelineProgress>
                      <BoldText>{Math.round(incentivesTimeline?.progress ?? 0)}% complete</BoldText>
                      {` • Epoch ${incentivesTimeline?.currentEpoch} of ${incentivesTimeline?.totalEpochs}`}
                    </TimelineProgress>
                    <TimelineRemaining>{incentivesTimeline?.daysRemaining} days to go</TimelineRemaining>
                  </TimelineFooter>
                </TimelineContent>
              </IncentivesBlock>
            </IncentivesRow>

            <IncentivesBanner>
              <InfoIcon>
                <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                  <path
                    d='M8 1C4.13438 1 1 4.13438 1 8C1 11.8656 4.13438 15 8 15C11.8656 15 15 11.8656 15 8C15 4.13438 11.8656 1 8 1ZM8 14C4.6875 14 2 11.3125 2 8C2 4.6875 4.6875 2 8 2C11.3125 2 14 4.6875 14 8C14 11.3125 11.3125 14 8 14Z'
                    fill='black'
                  />
                  <path
                    d='M7.25 5.25C7.25 5.44891 7.32902 5.63968 7.46967 5.78033C7.61032 5.92098 7.80109 6 8 6C8.19891 6 8.38968 5.92098 8.53033 5.78033C8.67098 5.63968 8.75 5.44891 8.75 5.25C8.75 5.05109 8.67098 4.86032 8.53033 4.71967C8.38968 4.57902 8.19891 4.5 8 4.5C7.80109 4.5 7.61032 4.57902 7.46967 4.71967C7.32902 4.86032 7.25 5.05109 7.25 5.25ZM8.375 7H7.625C7.55625 7 7.5 7.05625 7.5 7.125V11.375C7.5 11.4438 7.55625 11.5 7.625 11.5H8.375C8.44375 11.5 8.5 11.4438 8.5 11.375V7.125C8.5 7.05625 8.44375 7 8.375 7Z'
                    fill='black'
                  />
                </svg>
              </InfoIcon>
              <IncentivesBannerText>
                <BoldText>75 FXN</BoldText>
                {' distributed pro-rata by deposit volume among '}
                <BoldText>eligible depositor addresses</BoldText>
                {
                  ' per epoch. Only the first deposit per address per epoch is eligible. Rewards roll over if TVL is below $200k.'
                }
              </IncentivesBannerText>
            </IncentivesBanner>
          </IncentivesSection>
        )}

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

// Progress bar component that calculates fill for each epoch based on overall progress
const EpochProgressBar = ({ progress, epochs }: { progress: number; epochs: number }) => {
  const epochSize = 100 / epochs; // Size of each epoch as percentage

  const getEpochFill = (epochIndex: number) => {
    const epochStart = epochIndex * epochSize;
    const epochEnd = (epochIndex + 1) * epochSize;

    if (progress >= epochEnd) {
      // Epoch is fully complete
      return 100;
    } else if (progress <= epochStart) {
      // Epoch hasn't started
      return 0;
    } else {
      // Epoch is partially complete
      return ((progress - epochStart) / epochSize) * 100;
    }
  };

  return (
    <ProgressBar>
      {Array.from({ length: epochs }, (_, i) => {
        const fill = getEpochFill(i);
        const isMiddle = i > 0 && i < epochs - 1;

        return (
          <ProgressEpoch key={i} isMiddle={isMiddle}>
            {fill > 0 && <ProgressFilled style={{ width: `${fill}%` }} />}
            {fill < 100 && <ProgressRemaining style={{ width: `${100 - fill}%` }} />}
          </ProgressEpoch>
        );
      })}
    </ProgressBar>
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
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '20px',
  borderRight: !isLast ? '1px solid #999999' : 'none',
  [theme.breakpoints.down('sm')]: {
    borderRight: 'none',
    borderBottom: !isLast ? '1px solid #999999' : 'none',
  },
}));

const AcceptedFundsLabel = styled(Typography)(() => ({
  fontFamily: ibm_plex_mono.style.fontFamily,
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const AcceptedFundsValue = styled(Typography)(() => ({
  fontFamily: ibm_plex_mono.style.fontFamily,
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: 'normal',
  color: '#000',
}));

const AcceptedFundsTokenAmount = styled(Typography)(() => ({
  fontFamily: ibm_plex_mono.style.fontFamily,
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

// Incentives Section Styled Components
const IncentivesSection = styled(Box)(({ theme }) => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  backgroundColor: theme.palette.background.paper,
}));

const IncentivesRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

const IncentivesBlock = styled(Box)(({ theme }) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '20px',
  minHeight: '107px',
  justifyContent: 'center',
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    '&:first-of-type': {
      borderBottom: `1px solid ${theme.palette.grey[600]}`,
    },
  },
}));

const IncentivesDivider = styled(Box)(({ theme }) => ({
  width: '1px',
  height: '85px',
  backgroundColor: theme.palette.grey[600],
  [theme.breakpoints.down('sm')]: {
    display: 'none',
  },
}));

const IncentivesLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const IncentivesValueRow = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
}));

const IncentivesValue = styled(Typography)(() => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: 'normal',
  color: '#000000',
}));

const ClaimButton = styled('a')({
  backgroundColor: '#FFFFFF',
  border: '1px solid #000000',
  borderRadius: '4px',
  padding: '4px 12px',
  fontWeight: 500,
  fontSize: '14px',
  lineHeight: 'normal',
  color: '#000000',
  textTransform: 'none',
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#f5f5f5',
    border: '1px solid #000000',
    color: '#000000',
  },
});

const IncentivesSubtext = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const TimelineHeader = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
}));

const TimelineLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const TimelineDays = styled(Typography)(() => ({
  flex: 1,
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
  textAlign: 'right',
}));

const TimelineContent = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  flex: 1,
  justifyContent: 'center',
  width: '100%',
}));

const ProgressBar = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '10px',
}));

const ProgressEpoch = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isMiddle',
})<{ isMiddle?: boolean }>(({ isMiddle }) => ({
  flex: 1,
  display: 'flex',
  height: '10px',
  marginLeft: isMiddle ? '1px' : 0,
  marginRight: isMiddle ? '1px' : 0,
}));

const ProgressFilled = styled(Box)(() => ({
  backgroundColor: '#7d9c40',
  height: '10px',
}));

const ProgressRemaining = styled(Box)(() => ({
  backgroundColor: '#e6e6e6',
  height: '10px',
}));

const TimelineFooter = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  width: '100%',
}));

const TimelineProgress = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const TimelineRemaining = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const IncentivesBanner = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 20px',
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.grey[600]}`,
}));

const InfoIcon = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  flexShrink: 0,
}));

const IncentivesBannerText = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '16px',
  color: '#000000',
  flex: 1,
}));

const BoldText = styled('span')(() => ({
  fontWeight: 600,
}));
