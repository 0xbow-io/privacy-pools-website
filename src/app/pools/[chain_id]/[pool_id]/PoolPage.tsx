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
import { allPoolsChainData, ChainAssets, chainData, PoolInfo } from '~/config';
import { Section, PAContainer, ActionMenu } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useAdvancedView, useChainContext } from '~/hooks';
import { EventType, ModalType, ReviewStatus } from '~/types';
import { ROUTER, aspClient } from '~/utils';

interface PoolPageProps {
  chainId: string;
  poolId: string;
}

export const PoolPage = ({ chainId, poolId }: PoolPageProps) => {
  const { push } = useRouter();
  const { address } = useAccount();
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
  const [activityView, setActivityView] = useState<'global' | 'personal' | 'stats'>(address ? 'personal' : 'global');

  // Fetch pool info for this specific pool
  const poolScope = useMemo(() => {
    const matchedPool = chain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase());
    return matchedPool?.scope.toString();
  }, [poolId, chain]);

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

  // Get the current pool's stats from the pools array
  const currentPoolStats = useMemo(() => {
    if (!poolStatsData?.pools || !poolScope) return null;
    return poolStatsData.pools.find((pool) => pool.scope === poolScope);
  }, [poolStatsData, poolScope]);

  // Calculate stats - token amounts
  const acceptedFundsToken = useMemo(() => {
    if (currentPoolStats?.acceptedDepositsValue) {
      return Number(formatUnits(BigInt(currentPoolStats.acceptedDepositsValue), assetDecimals || decimals));
    }
    if (!poolData?.totalInPoolValue) return 0;
    return Number(formatUnits(BigInt(poolData.totalInPoolValue), assetDecimals || decimals));
  }, [currentPoolStats, poolData, assetDecimals, decimals]);

  const pendingFundsToken = useMemo(() => {
    if (!currentPoolStats?.pendingDepositsValue) return 0;
    return Number(formatUnits(BigInt(currentPoolStats.pendingDepositsValue), assetDecimals || decimals));
  }, [currentPoolStats, assetDecimals, decimals]);

  const myFundsToken = useMemo(() => {
    if (!isLogged) return 0;
    return Number(formatUnits(amountPoolAsset, assetDecimals || decimals));
  }, [isLogged, amountPoolAsset, assetDecimals, decimals]);

  const myFundsUsd = useMemo(() => {
    return myFundsToken * (price || 0);
  }, [myFundsToken, price]);

  // Calculate pool-specific stats for the Stats tab
  const poolActivityStats = useMemo(() => {
    // TVL in USD
    let tvl = 0;
    if (currentPoolStats?.totalInPoolValueUsd) {
      const parsedUSD = parseFloat(currentPoolStats.totalInPoolValueUsd.replace(/,/g, ''));
      if (!isNaN(parsedUSD)) {
        tvl = parsedUSD;
      }
    }

    // Total deposits count
    const totalDeposits = currentPoolStats?.acceptedDepositsCount || 0;

    // Average deposit size in USD
    const averageDepositSize = totalDeposits > 0 ? tvl / totalDeposits : 0;

    // Total withdrawals (approximation: total deposited - current TVL)
    let totalWithdrawals = 0;
    if (currentPoolStats?.totalDepositsValueUsd && currentPoolStats?.totalInPoolValueUsd) {
      const totalDepositedUsd = parseFloat(currentPoolStats.totalDepositsValueUsd.replace(/,/g, '')) || 0;
      const currentUsd = parseFloat(currentPoolStats.totalInPoolValueUsd.replace(/,/g, '')) || 0;
      totalWithdrawals = Math.max(0, totalDepositedUsd - currentUsd);
    }

    return {
      tvl,
      averageDepositSize,
      totalDeposits,
      totalWithdrawals,
    };
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
            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Accepted Funds</StatLabel>
              <StatValue>
                {Math.round(acceptedFundsToken).toLocaleString('en-US')} {symbol}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Pending Funds</StatLabel>
              <StatValue>
                {Math.round(pendingFundsToken).toLocaleString('en-US')} {symbol}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>My Funds</StatLabel>
              <StatValue>
                {Math.round(myFundsToken).toLocaleString('en-US')} {symbol}
              </StatValue>
              <StatSubtext>${Math.round(myFundsUsd).toLocaleString('en-US')}</StatSubtext>
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

                {/* Stats tab hidden for now
                <ActivityDivider />

                <ActivityButton
                  variant='text'
                  onClick={() => setActivityView('stats')}
                  active={String(activityView === 'stats')}
                >
                  Stats
                </ActivityButton>
                */}
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
            <ActivityStatsGrid>
              <ActivityStatItem>
                <ActivityStatLabel>Current TVL</ActivityStatLabel>
                <ActivityStatValue>
                  ${poolActivityStats.tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </ActivityStatValue>
              </ActivityStatItem>
              <ActivityStatItem>
                <ActivityStatLabel>Average Deposit Size</ActivityStatLabel>
                <ActivityStatValue>
                  ${poolActivityStats.averageDepositSize.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </ActivityStatValue>
              </ActivityStatItem>
              <ActivityStatItem>
                <ActivityStatLabel>Total Deposits</ActivityStatLabel>
                <ActivityStatValue>{poolActivityStats.totalDeposits.toLocaleString('en-US')}</ActivityStatValue>
              </ActivityStatItem>
              <ActivityStatItem>
                <ActivityStatLabel>Total Withdrawals</ActivityStatLabel>
                <ActivityStatValue>
                  ${poolActivityStats.totalWithdrawals.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </ActivityStatValue>
              </ActivityStatItem>
            </ActivityStatsGrid>
          </ActivityStatsContainer>
        ) : (
          <ActivityTable records={activityData} isLoading={activityLoading} view={activityView} size='small' />
        )}
      </ActivityContainer>
    </PoolPageContainer>
  );
};

// Custom Pool Asset Select Component with two-level selection (Chain -> Token)
const PoolAssetSelect = ({ chainId, poolId }: { chainId: number; poolId: string }) => {
  const router = useRouter();
  const { setSelectedAsset } = useChainContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(chainId);
  const [chainSearchQuery, setChainSearchQuery] = useState('');
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get available chains that have pools, filtered by search
  const availableChains = useMemo(() => {
    const chains = Object.entries(allPoolsChainData).map(([cId, chainInfo]) => ({
      chainId: parseInt(cId),
      name: chainInfo.name,
      image: chainInfo.image,
    }));

    if (!chainSearchQuery.trim()) return chains;
    return chains.filter((c) => c.name.toLowerCase().includes(chainSearchQuery.toLowerCase()));
  }, [chainSearchQuery]);

  // Get tokens for the selected chain, filtered by search
  const tokensForChain = useMemo(() => {
    const chainInfo = allPoolsChainData[selectedChainId];
    if (!chainInfo) return [];
    const tokens = chainInfo.poolInfo.map((pool: PoolInfo) => ({
      asset: pool.asset,
      icon: pool.icon,
      scope: pool.scope.toString(),
    }));

    if (!tokenSearchQuery.trim()) return tokens;
    return tokens.filter((t) => t.asset.toLowerCase().includes(tokenSearchQuery.toLowerCase()));
  }, [selectedChainId, tokenSearchQuery]);

  // Find chains that have the searched token when not found in current chain
  const chainsWithSearchedToken = useMemo(() => {
    if (!tokenSearchQuery.trim() || tokensForChain.length > 0) return [];

    const matchingChains: { chainId: number; name: string }[] = [];
    for (const [cId, chainInfo] of Object.entries(allPoolsChainData)) {
      const chainIdNum = parseInt(cId);
      if (chainIdNum === selectedChainId) continue; // Skip current chain

      const hasToken = chainInfo.poolInfo.some((pool: PoolInfo) =>
        pool.asset.toLowerCase().includes(tokenSearchQuery.toLowerCase()),
      );

      if (hasToken) {
        matchingChains.push({ chainId: chainIdNum, name: chainInfo.name });
      }
    }
    return matchingChains;
  }, [tokenSearchQuery, tokensForChain.length, selectedChainId]);

  // Get current selection info
  const currentChain = chainData[chainId];
  const currentPool = currentChain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase());

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSelectedChainId(chainId); // Reset to current chain when opening
      setChainSearchQuery('');
      setTokenSearchQuery('');
    }
  };

  const handleChainSelect = (newChainId: number) => {
    setSelectedChainId(newChainId);
    setTokenSearchQuery(''); // Clear token search when changing chain
  };

  const handleTokenSelect = (asset: string) => {
    setSelectedAsset(asset as ChainAssets);
    router.push(`/pools/${selectedChainId}/${asset.toLowerCase()}`);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <PoolSelectorContainer ref={dropdownRef}>
      <PoolSelectorButton onClick={handleToggle}>
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
        <DropdownArrow open={isOpen}>
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

      {isOpen && (
        <PoolSelectorDropdown>
          <DropdownContent>
            {/* Chain selector (left side) */}
            <ChainColumn>
              <SearchContainer>
                <SearchIconSvg />
                <SearchInput
                  type='text'
                  placeholder='Search Chains'
                  value={chainSearchQuery}
                  onChange={(e) => setChainSearchQuery(e.target.value)}
                />
              </SearchContainer>
              <ChainList showScrollbar={availableChains.length >= 7}>
                {availableChains.map((chain) => (
                  <ChainItem
                    key={chain.chainId}
                    selected={chain.chainId === selectedChainId}
                    onClick={() => handleChainSelect(chain.chainId)}
                  >
                    <Image src={chain.image} alt={chain.name} width={24} height={24} />
                    <span>{chain.name}</span>
                    {chain.chainId === selectedChainId && (
                      <CheckIcon>
                        <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                          <path
                            d='M13.5 4.5L6 12L2.5 8.5'
                            stroke='black'
                            strokeWidth='1.5'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          />
                        </svg>
                      </CheckIcon>
                    )}
                  </ChainItem>
                ))}
                {availableChains.length === 0 && <NoResultsText>No chains found</NoResultsText>}
              </ChainList>
            </ChainColumn>

            {/* Token selector (right side) */}
            <TokenColumn>
              <SearchContainer>
                <SearchIconSvg />
                <SearchInput
                  type='text'
                  placeholder='Search Tokens'
                  value={tokenSearchQuery}
                  onChange={(e) => setTokenSearchQuery(e.target.value)}
                />
              </SearchContainer>
              <TokenList showScrollbar={tokensForChain.length >= 7}>
                {tokensForChain.map((token) => (
                  <TokenItem
                    key={token.asset}
                    onClick={() => handleTokenSelect(token.asset)}
                    selected={selectedChainId === chainId && token.asset.toLowerCase() === poolId.toLowerCase()}
                  >
                    {token.icon && <Image src={token.icon} alt={token.asset} width={24} height={24} />}
                    <span>{token.asset}</span>
                  </TokenItem>
                ))}
                {tokensForChain.length === 0 && chainsWithSearchedToken.length === 0 && (
                  <NoResultsText>No tokens found</NoResultsText>
                )}
                {tokensForChain.length === 0 && chainsWithSearchedToken.length > 0 && (
                  <TokenAvailableOnOtherChains>
                    This token is only available on{' '}
                    {chainsWithSearchedToken.map((chain, index) => (
                      <span key={chain.chainId}>
                        <ChainLink onClick={() => handleChainSelect(chain.chainId)}>{chain.name}</ChainLink>
                        {index < chainsWithSearchedToken.length - 2 && ', '}
                        {index === chainsWithSearchedToken.length - 2 && ' and '}
                      </span>
                    ))}
                  </TokenAvailableOnOtherChains>
                )}
              </TokenList>
            </TokenColumn>
          </DropdownContent>
        </PoolSelectorDropdown>
      )}
    </PoolSelectorContainer>
  );
};

// Search icon component
const SearchIconSvg = () => (
  <SearchIcon>
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <path
        d='M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z'
        stroke='#999'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path d='M14 14L11 11' stroke='#999' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  </SearchIcon>
);

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

const PoolSelectorDropdown = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '4px',
  backgroundColor: '#fff',
  border: '1px solid #000',
  zIndex: 1000,
  minWidth: '500px',
  height: '380px',
  overflow: 'hidden',
  [theme.breakpoints.down('sm')]: {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    top: 'auto',
    minWidth: 'calc(100vw - 32px)',
    maxWidth: '500px',
  },
}));

const DropdownContent = styled('div')(() => ({
  display: 'flex',
  height: '100%',
}));

const ChainColumn = styled('div')(() => ({
  width: '200px',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid #E6E6E6',
  height: '100%',
}));

const TokenColumn = styled('div')(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}));

const SearchContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid #E6E6E6',
  gap: '8px',
}));

const SearchIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}));

const SearchInput = styled('input')(() => ({
  flex: 1,
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  '&::placeholder': {
    color: '#999',
  },
}));

const ChainList = styled('div', {
  shouldForwardProp: (prop) => prop !== 'showScrollbar',
})<{ showScrollbar?: boolean }>(({ showScrollbar = true }) => ({
  flex: 1,
  overflowY: 'auto',
  '&::-webkit-scrollbar': {
    width: showScrollbar ? '4px' : '0px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#E6E6E6',
    borderRadius: '4px',
  },
  scrollbarWidth: showScrollbar ? 'thin' : 'none',
}));

const ChainItem = styled('div', {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 16px',
  cursor: 'pointer',
  backgroundColor: selected ? '#F5F5F5' : 'transparent',
  fontSize: '13px',
  fontWeight: selected ? 600 : 400,
  '&:hover': {
    backgroundColor: '#F5F5F5',
  },
  '& span': {
    flex: 1,
  },
}));

const CheckIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}));

const TokenList = styled('div', {
  shouldForwardProp: (prop) => prop !== 'showScrollbar',
})<{ showScrollbar?: boolean }>(({ showScrollbar = true }) => ({
  flex: 1,
  overflowY: 'auto',
  '&::-webkit-scrollbar': {
    width: showScrollbar ? '4px' : '0px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#E6E6E6',
    borderRadius: '4px',
  },
  scrollbarWidth: showScrollbar ? 'thin' : 'none',
}));

const TokenItem = styled('div', {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  cursor: 'pointer',
  backgroundColor: selected ? '#F5F5F5' : 'transparent',
  fontSize: '14px',
  fontWeight: selected ? 600 : 400,
  borderBottom: '1px solid #E6E6E6',
  '&:hover': {
    backgroundColor: '#F5F5F5',
  },
  '&:last-child': {
    borderBottom: 'none',
  },
}));

const NoResultsText = styled('div')(() => ({
  padding: '16px',
  color: '#999',
  fontSize: '13px',
  textAlign: 'center',
}));

const TokenAvailableOnOtherChains = styled('div')(() => ({
  padding: '16px',
  color: '#666',
  fontSize: '13px',
  textAlign: 'center',
  lineHeight: '1.5',
}));

const ChainLink = styled('span')(() => ({
  color: '#000',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  '&:hover': {
    color: '#666',
  },
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

const ActivityStatsContainer = styled(Box)(({ theme }) => ({
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  padding: '24px 16px',
}));

const ActivityStatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '24px',
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
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
