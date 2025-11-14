'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Stack, Typography, Button, styled, Box, Autocomplete, TextField, IconButton, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { PoolAccountTable, ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { allPoolsChainData, ChainAssets, chainData, getConfig, PoolInfo } from '~/config';
import { Section, PAContainer, ActionMenu } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useAdvancedView, useChainContext } from '~/hooks';
import { EventType, ModalType, ReviewStatus } from '~/types';
import { ROUTER, aspClient } from '~/utils';

interface PoolOption {
  value: ChainAssets;
  label: string;
  chainId: number;
  chainName: string;
  icon?: string;
  scope?: string;
}

interface PoolPageProps {
  chainId: string;
  poolId: string;
}

export const PoolPage = ({ chainId, poolId }: PoolPageProps) => {
  const { push } = useRouter();
  const { address } = useAccount();
  const aspUrl = getConfig().env.ASP_ENDPOINT;
  const { setChainId, setSelectedAsset, price } = useChainContext();
  const {
    balanceBN: { symbol, decimals },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const accountContext = useAccountContext();
  const { poolsByAssetAndChain, amountPoolAsset, hideEmptyPools, toggleHideEmptyPools, poolAccountsByChainScope } =
    accountContext;
  const { previewGlobalEvents, isLoading: activityLoading } = useAdvancedView();
  const { setModalOpen } = useModal();
  const { isLogged, isConnected, isAuthorized } = useAuthContext();
  const goTo = useGoTo();

  // Get chain name for display
  const parsedChainId = parseInt(chainId, 10);
  const chain = chainData[parsedChainId];

  // Activity view state - default to 'personal' if address exists
  const [activityView, setActivityView] = useState<'global' | 'personal'>(address ? 'personal' : 'global');

  // Fetch pool info for this specific pool
  const poolScope = useMemo(() => {
    const matchedPool = chain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase());
    return matchedPool?.scope.toString();
  }, [poolId, chain]);

  const { data: poolData } = useQuery({
    queryKey: ['pool_info', parsedChainId, poolScope, aspUrl],
    queryFn: () => aspClient.fetchPoolInfo(aspUrl, parsedChainId, poolScope || ''),
    enabled: !!poolScope,
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
    enabled: !!poolScope,
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Get the current pool's stats from the pools array
  const currentPoolStats = useMemo(() => {
    if (!poolStatsData?.pools || !poolScope) return null;
    return poolStatsData.pools.find((pool) => pool.scope === poolScope);
  }, [poolStatsData, poolScope]);

  // Calculate stats
  const acceptedFunds = useMemo(() => {
    // First try to use acceptedDepositsValueUsd from currentPoolStats
    if (currentPoolStats?.acceptedDepositsValueUsd) {
      const usdValue = parseFloat(currentPoolStats.acceptedDepositsValueUsd.replace(/,/g, ''));
      if (usdValue > 0) {
        return usdValue;
      }
    }

    // Fallback to acceptedDepositsValue if USD value is 0 or unavailable
    if (currentPoolStats?.acceptedDepositsValue) {
      const tokenAmount = formatUnits(BigInt(currentPoolStats.acceptedDepositsValue), assetDecimals || decimals);
      // Estimate USD value using rough price estimates
      let priceUSD = 1; // Default for stablecoins
      if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'wstETH' || symbol === 'WOETH') {
        priceUSD = 2500; // ETH price
      } else if (symbol === 'wBTC') {
        priceUSD = 40000; // BTC price
      }
      return Number(tokenAmount) * priceUSD;
    }

    // Final fallback to poolData.totalInPoolValue
    if (!poolData?.totalInPoolValue) return 0;
    const totalFunds = formatUnits(BigInt(poolData.totalInPoolValue), assetDecimals || decimals);
    let priceUSD = 1; // Default for stablecoins
    if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'wstETH' || symbol === 'WOETH') {
      priceUSD = 2500; // ETH price
    } else if (symbol === 'wBTC') {
      priceUSD = 40000; // BTC price
    }
    return Number(totalFunds) * priceUSD;
  }, [currentPoolStats, poolData, assetDecimals, decimals, symbol]);

  const pendingFunds = useMemo(() => {
    if (!currentPoolStats?.pendingDepositsValueUsd) return 0;
    return Number(currentPoolStats.pendingDepositsValueUsd);
  }, [currentPoolStats]);

  const myFunds = useMemo(() => {
    if (!isLogged) return 0;
    const amount = formatUnits(amountPoolAsset, assetDecimals || decimals);
    // Use Alchemy price from ChainContext, fallback to 0 if not available
    return Number(amount) * (price || 0);
  }, [isLogged, amountPoolAsset, assetDecimals, decimals, price]);

  const myFundsToken = useMemo(() => {
    if (!isLogged) return '0';
    return formatUnits(amountPoolAsset, assetDecimals || decimals);
  }, [isLogged, amountPoolAsset, assetDecimals, decimals]);

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
        });
      }
    }

    for (const { ragequit, scope } of accountsForThisPool) {
      if (!ragequit?.transactionHash) continue;
      history.push({
        type: EventType.EXIT,
        txHash: ragequit?.transactionHash,
        reviewStatus: ReviewStatus.APPROVED,
        amount: ragequit?.value,
        timestamp: Number(ragequit?.timestamp),
        label: ragequit?.label,
        scope: scope,
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

  const activityData = activityView === 'global' ? previewGlobalEvents : localPreviewPersonalActivity;

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
                  <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
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
            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Accepted Funds</StatLabel>
              <StatValue>
                ${acceptedFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Pending Funds</StatLabel>
              <StatValue>
                ${pendingFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>My Funds</StatLabel>
              <StatValue>
                ${myFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatSubtext>
                {myFundsToken} {symbol}
              </StatSubtext>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3} isLast>
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
              </Stack>

              <ViewAllButton onClick={handleNavigateToActivity} disabled={!activityData?.length}>
                <ViewAllText>View All</ViewAllText>
              </ViewAllButton>
            </Stack>
          </Box>
        </ActivitySection>

        <ActivityTable records={activityData} isLoading={activityLoading} view={activityView} size='small' />
      </ActivityContainer>
    </PoolPageContainer>
  );
};

// Custom Pool Asset Select Component
const PoolAssetSelect = ({ chainId, poolId }: { chainId: number; poolId: string }) => {
  const router = useRouter();
  const { setSelectedAsset } = useChainContext();
  const aspUrl = getConfig().env.ASP_ENDPOINT;

  // Fetch pool stats for ALL chains (same as AllPoolsStats)
  const { data: poolStatsData } = useQuery({
    queryKey: ['pool_stats_selector', 'all', aspUrl],
    queryFn: () => aspClient.fetchPoolStats(aspUrl, 'all'),
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Get all available pools from ALL chains
  const baseOptions: PoolOption[] = useMemo(() => {
    const options: PoolOption[] = [];

    Object.entries(allPoolsChainData).forEach(([cId, chainInfo]) => {
      chainInfo.poolInfo.forEach((pool: PoolInfo) => {
        options.push({
          value: pool.asset as ChainAssets,
          label: pool.asset,
          chainId: parseInt(cId),
          chainName: chainInfo.name,
          icon: pool.icon,
          scope: pool.scope.toString(),
        });
      });
    });

    return options;
  }, []);

  // Sort pools by popularity (totalInPoolValueUsd) with priority pools first
  const availableOptions = useMemo(() => {
    if (!poolStatsData?.pools) return baseOptions;

    // TEMPORARY: Priority pools for Frax announcement (chain-specific)
    const PRIORITY_POOLS: Array<{ chainId: number; asset: string }> = [
      { chainId: 1, asset: 'ETH' }, // Ethereum mainnet ETH
      { chainId: 1, asset: 'FRXUSD' }, // Ethereum mainnet frxUSD
      { chainId: 1, asset: 'USDC' }, // Ethereum mainnet USDC
    ];

    return [...baseOptions].sort((a, b) => {
      // Check if pools are in priority list (chain-specific)
      const aIsPriority = PRIORITY_POOLS.some(
        (p) => p.chainId === a.chainId && p.asset.toUpperCase() === a.value.toUpperCase(),
      );
      const bIsPriority = PRIORITY_POOLS.some(
        (p) => p.chainId === b.chainId && p.asset.toUpperCase() === b.value.toUpperCase(),
      );

      const aPriorityIndex = PRIORITY_POOLS.findIndex(
        (p) => p.chainId === a.chainId && p.asset.toUpperCase() === a.value.toUpperCase(),
      );
      const bPriorityIndex = PRIORITY_POOLS.findIndex(
        (p) => p.chainId === b.chainId && p.asset.toUpperCase() === b.value.toUpperCase(),
      );

      // Priority pools come first, sorted by their priority order
      if (aIsPriority && bIsPriority) {
        return aPriorityIndex - bPriorityIndex;
      }
      if (aIsPriority) return -1;
      if (bIsPriority) return 1;

      // Sort by totalInPoolValueUsd (most popular) for non-priority pools
      if (!poolStatsData.pools) return 0;
      // Use chainId-scope as key to find the right pool stats
      const aKey = `${a.chainId}-${a.scope}`;
      const bKey = `${b.chainId}-${b.scope}`;
      const aStats = poolStatsData.pools.find((p) => `${p.chainId}-${p.scope}` === aKey);
      const bStats = poolStatsData.pools.find((p) => `${p.chainId}-${p.scope}` === bKey);
      const aFunds = aStats?.totalInPoolValueUsd ? parseFloat(aStats.totalInPoolValueUsd.replace(/,/g, '')) : 0;
      const bFunds = bStats?.totalInPoolValueUsd ? parseFloat(bStats.totalInPoolValueUsd.replace(/,/g, '')) : 0;
      return bFunds - aFunds;
    });
  }, [baseOptions, poolStatsData]);

  const selectedOption = availableOptions.find(
    (opt) => opt.value.toLowerCase() === poolId.toLowerCase() && opt.chainId === chainId,
  );

  const handleChange = (_event: React.SyntheticEvent, newValue: PoolOption | null) => {
    if (newValue) {
      setSelectedAsset(newValue.value);
      router.push(`/pools/${newValue.chainId}/${newValue.value.toLowerCase()}`);
    }
  };

  return (
    <PoolSelectAutocompleteStyled
      value={selectedOption || undefined}
      onChange={handleChange}
      options={availableOptions}
      getOptionLabel={(option) => option.label}
      componentsProps={{
        popper: {
          style: { width: 'fit-content' },
        },
        paper: {
          sx: {
            border: '1px solid #000000',
            boxShadow: 'none',
            '& .MuiAutocomplete-listbox': {
              padding: 0,
              '&::-webkit-scrollbar': {
                width: '4px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#E6E6E6',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: '#D0D0D0',
              },
              scrollbarWidth: 'thin',
              scrollbarColor: '#E6E6E6 transparent',
            },
            '& .MuiAutocomplete-option': {
              padding: '12px 0px',
              height: '45px',
              borderBottom: '1px solid #E6E6E6',
              '&:last-child': {
                borderBottom: 'none',
              },
            },
          },
        },
      }}
      renderOption={(props, option) => (
        <li {...props} key={`${option.chainId}-${option.value}`}>
          <PoolOptionContent>
            {option.icon && (
              <PoolIconWrapper>
                <Image src={option.icon} alt={option.label} width={24} height={24} />
              </PoolIconWrapper>
            )}
            <span>
              {option.label}@<ChainNameText>{option.chainName}</ChainNameText>
            </span>
          </PoolOptionContent>
        </li>
      )}
      renderInput={(params) => {
        const icon = selectedOption?.icon;
        const { InputProps, inputProps, ...restParams } = params;
        const { endAdornment, ...restInputProps } = InputProps;

        return (
          <TextField
            {...restParams}
            size='small'
            variant='outlined'
            InputProps={{
              ...restInputProps,
              startAdornment: (
                <>
                  {icon && (
                    <PoolIconWrapper sx={{ mr: '0.8rem' }}>
                      <Image src={icon} alt={selectedOption?.label || ''} width={24} height={24} />
                    </PoolIconWrapper>
                  )}
                  {selectedOption && (
                    <Box
                      component='span'
                      sx={{ display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: '16px' }}
                    >
                      <span>{selectedOption.label}</span>
                      <ChainNameText>@{selectedOption.chainName}</ChainNameText>
                    </Box>
                  )}
                </>
              ),
              endAdornment: (
                <>
                  <Typography
                    variant='subtitle1'
                    fontWeight='bold'
                    lineHeight='1'
                    sx={{ ml: '4px', mr: '4px', whiteSpace: 'nowrap' }}
                  >
                    Pool
                  </Typography>
                  {endAdornment}
                </>
              ),
            }}
            inputProps={{
              ...inputProps,
              value: '',
              style: { width: 0, padding: 0, margin: 0, minWidth: 0, flex: 'none' }, // Hide the default input since we're using startAdornment
            }}
          />
        );
      }}
      disableClearable
    />
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

const PoolSelectAutocomplete = styled(Autocomplete<PoolOption, false, true, false>)(({ theme }) => ({
  width: 'fit-content',
  maxWidth: 'fit-content',
  marginLeft: '-4px',
  '& .MuiOutlinedInput-root': {
    fontWeight: 600,
    fontSize: '16px',
    paddingLeft: '12px',
    paddingRight: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    width: 'fit-content',
    maxWidth: 'fit-content',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    '& .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
  },
  '& .MuiAutocomplete-input': {
    cursor: 'pointer',
    padding: '0 !important',
    minWidth: '0 !important',
    width: '0 !important',
    flex: '0 0 auto',
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  '& .MuiInputBase-input': {
    overflow: 'visible !important',
    textOverflow: 'clip !important',
    whiteSpace: 'nowrap !important',
  },
  '& .MuiAutocomplete-endAdornment': {
    position: 'relative !important',
    top: 'auto !important',
    right: 'auto !important',
    transform: 'none !important',
    display: 'flex',
    alignItems: 'center',
    marginLeft: '0px',
  },
  '& .MuiAutocomplete-popupIndicator': {
    border: '1px solid transparent',
    padding: '4px',
    marginRight: '0',
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
      border: '1px solid transparent',
    },
    '&:focus': {
      border: '1px solid transparent',
    },
  },
  [theme.breakpoints.down('sm')]: {
    maxWidth: '250px',
  },
}));

// Override the popper width globally for this autocomplete
const PoolSelectAutocompleteStyled = styled(PoolSelectAutocomplete)(() => ({
  '& + .MuiAutocomplete-popper': {
    width: 'fit-content !important',
    minWidth: '200px',
    '& .MuiPaper-root': {
      width: 'fit-content !important',
    },
    '& .MuiAutocomplete-listbox': {
      width: 'fit-content !important',
    },
  },
}));

const PoolOptionContent = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
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
  fontWeight: 600,
  //textDecoration: 'underline',
  //textUnderlineOffset: '0.3rem',
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

const StatChange = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#7D9C40',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}));

const StatSubtext = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const TrendIcon = styled('span')(() => ({
  fontSize: '14px',
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
