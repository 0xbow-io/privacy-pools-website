'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Grid,
  InputAdornment,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { InfoTooltip } from '~/components/InfoTooltip';
import { chainData, getConfig, PoolInfo } from '~/config';
import { PAContainer, Section } from '~/containers';
import type { PoolResponse } from '~/types';
import { aspClient } from '~/utils';

export interface PoolCardData {
  poolName: string;
  icon?: string;
  asset: string;
  chainId: number;
  scope: string;
  totalFunds: bigint;
  fundsPending: bigint;
  totalFundsUSD?: number;
  growthPercentage?: number;
  decimals: number;
  acceptedDepositsCount: number;
  depositVarianceScore: number; // 0-1, where 1 is best (low variance)
}

export interface PrivacyScoreBar {
  redFillWidth: number;
  greenFillWidth: number;
}

// Calculate deposit variance score from pool events
// Lower variance (more uniform deposits) = better privacy
export const calculateDepositVarianceScore = (poolData: PoolResponse | undefined): number => {
  if (!poolData?.recentEvents || poolData.recentEvents.length < 2) {
    return 0.5; // Default to neutral score if insufficient data
  }

  // Extract deposit amounts from recent events (filter for deposits only)
  const depositAmounts = poolData.recentEvents
    .filter((event) => event.type === 'deposit' && event.amount)
    .map((event) => {
      // amount is a bigint string, need to parse it
      const amount = BigInt(event.amount || '0');
      return Number(amount);
    })
    .filter((amount) => amount > 0);

  if (depositAmounts.length < 2) {
    return 0.5; // Default to neutral score
  }

  // Calculate median and coefficient of variation
  const sorted = [...depositAmounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (median === 0) return 0.5;

  // Calculate median absolute deviation (MAD) - more robust than standard deviation
  const deviations = depositAmounts.map((amount) => Math.abs(amount - median));
  const mad = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;

  // Coefficient of variation relative to median
  const cv = mad / median;

  // Convert CV to score (0-1, where 1 is best)
  // CV < 0.1 (10% variance) = excellent (score ~1.0)
  // CV around 0.5 = moderate (score ~0.5)
  // CV > 2.0 (200% variance) = poor (score ~0.1)
  const score = Math.max(0.1, Math.min(1.0, 1.0 - Math.min(cv / 2, 0.9)));

  return score;
};

// Calculate privacy score bar based on total funds, anonymity set size, and deposit uniformity
// Middle point is 1M funds, green goes right (1M-100M), red goes left (0-1M)
// Anonymity set size (deposit count) and deposit uniformity act as multipliers for the score
export const calculatePrivacyScore = (
  totalFundsUSD: number,
  depositCount: number,
  depositVarianceScore: number,
): PrivacyScoreBar => {
  const ONE_MILLION = 1_000_000;
  const HUNDRED_MILLION = 100_000_000;
  const RED_SEGMENT_WIDTH = 38.2041;
  const GREEN_SEGMENT_WIDTH = 43.291;

  // If data appears to be loading (no funds and no deposits), return neutral state (all gray)
  if (totalFundsUSD === 0 && depositCount === 0) {
    return { redFillWidth: 0, greenFillWidth: 0 };
  }

  // Calculate anonymity set multiplier (0 to 1)
  // Logarithmic scale: 1 deposit = very low, 10 = decent, 100 = good, 1000+ = excellent
  const MIN_DEPOSITS = 1;
  const MAX_DEPOSITS = 1000;
  let anonymityMultiplier = 1;

  if (depositCount > 0) {
    const logMin = Math.log10(MIN_DEPOSITS);
    const logMax = Math.log10(MAX_DEPOSITS);
    const logValue = Math.log10(Math.min(depositCount, MAX_DEPOSITS));
    anonymityMultiplier = Math.max(0.1, (logValue - logMin) / (logMax - logMin));
  } else {
    anonymityMultiplier = 0.1; // Very low score for 0 deposits
  }

  // Combine anonymity and variance scores
  // Both contribute equally to overall privacy quality
  const privacyMultiplier = (anonymityMultiplier + depositVarianceScore) / 2;

  if (totalFundsUSD >= HUNDRED_MILLION) {
    // Max green, adjusted by privacy multiplier
    return { redFillWidth: 0, greenFillWidth: GREEN_SEGMENT_WIDTH * privacyMultiplier };
  } else if (totalFundsUSD > ONE_MILLION) {
    // Green zone: logarithmic scale from 1M to 100M, adjusted by privacy multiplier
    const logMin = Math.log10(ONE_MILLION);
    const logMax = Math.log10(HUNDRED_MILLION);
    const logValue = Math.log10(totalFundsUSD);
    const percentage = (logValue - logMin) / (logMax - logMin);
    return { redFillWidth: 0, greenFillWidth: GREEN_SEGMENT_WIDTH * percentage * privacyMultiplier };
  } else if (totalFundsUSD > 0) {
    // Red zone: linear scale from 0 to 1M (lower = more red)
    // Note: Red indicates low value, so we don't boost it with anonymity multiplier
    const percentage = (ONE_MILLION - totalFundsUSD) / ONE_MILLION;
    return { redFillWidth: RED_SEGMENT_WIDTH * percentage, greenFillWidth: 0 };
  } else {
    // Max red
    return { redFillWidth: RED_SEGMENT_WIDTH, greenFillWidth: 0 };
  }
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

  // Use totalFundsUSD from API if available, otherwise fallback to calculation
  const totalFundsUSD =
    pool.totalFundsUSD ??
    (() => {
      const totalFundsFormatted = formatUnits(pool.totalFunds, pool.decimals);
      const totalFundsNumber = Number(totalFundsFormatted);
      return totalFundsNumber * 2500; // Rough ETH to USD conversion fallback
    })();

  const totalFundsDisplay = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalFundsUSD);

  const hasGrowth = pool.growthPercentage !== undefined && pool.growthPercentage !== 0;
  const isPositiveGrowth = (pool.growthPercentage || 0) > 0;

  // Calculate privacy score bar based on total funds, deposit count, and deposit uniformity
  const privacyScoreBar = calculatePrivacyScore(totalFundsUSD, pool.acceptedDepositsCount, pool.depositVarianceScore);

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
        {hasGrowth && (
          <GrowthIndicator positive={isPositiveGrowth}>
            {isPositiveGrowth ? (
              <svg width='16' height='17' viewBox='0 0 16 17' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                  d='M10 4.25V5.25H13.2929L9 9.54295L6.8535 7.3965C6.80709 7.35005 6.75199 7.3132 6.69133 7.28806C6.63067 7.26292 6.56566 7.24998 6.5 7.24998C6.43434 7.24998 6.36933 7.26292 6.30867 7.28806C6.24801 7.3132 6.19291 7.35005 6.1465 7.3965L1 12.5429L1.70705 13.25L6.5 8.45705L8.6465 10.6035C8.69291 10.6499 8.74801 10.6868 8.80867 10.7119C8.86932 10.7371 8.93434 10.75 9 10.75C9.06566 10.75 9.13068 10.7371 9.19133 10.7119C9.25199 10.6868 9.30709 10.6499 9.3535 10.6035L14 5.95705V9.25H15V4.25H10Z'
                  fill='#7D9C40'
                />
              </svg>
            ) : (
              <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                  d='M10 12V11H13.2929L9 6.70705L6.8535 8.8535C6.80709 8.89995 6.75199 8.9368 6.69133 8.96194C6.63067 8.98708 6.56566 9.00002 6.5 9.00002C6.43434 9.00002 6.36933 8.98708 6.30867 8.96194C6.24801 8.9368 6.19291 8.89995 6.1465 8.8535L1 3.70705L1.70705 3L6.5 7.79295L8.6465 5.6465C8.69291 5.60005 8.74801 5.5632 8.80867 5.53806C8.86932 5.51292 8.93434 5.49998 9 5.49998C9.06566 5.49998 9.13068 5.51292 9.19133 5.53806C9.25199 5.5632 9.30709 5.60005 9.3535 5.6465L14 10.293L14 7H15L15 12H10Z'
                  fill='#BA6B5D'
                />
              </svg>
            )}
            <GrowthPercentage positive={isPositiveGrowth}>
              {Math.abs(pool.growthPercentage || 0).toFixed(1)}%
            </GrowthPercentage>
            <GrowthTimeframe>past 24h</GrowthTimeframe>
          </GrowthIndicator>
        )}
      </PoolHeader>

      <PoolStats>
        <StatLabel>Total funds</StatLabel>
        <Stack direction='row' alignItems='center' gap='4px'>
          <StatLabel>Privacy score</StatLabel>
          <InfoTooltip
            message={`Privacy score based on pool size (${(pool.acceptedDepositsCount || 0).toLocaleString()} deposits), total funds, and deposit uniformity (${Math.round(pool.depositVarianceScore * 100)}%)`}
          />
        </Stack>
      </PoolStats>

      <PoolStatsBottom>
        <Stack direction='row' alignItems='center' gap='4px'>
          <TotalFundsValue>{totalFundsDisplay}</TotalFundsValue>
          <InfoTooltip message='Total funds in the pool' iconWidth={14} iconHeight={14} />
        </Stack>
        <PrivacyScoreBar>
          {/* Segment 1: Gray unless red is at max, then red */}
          {privacyScoreBar.redFillWidth >= 38.2041 ? (
            <PrivacyScoreSegment width={23.7959} color='#BA6B5D' />
          ) : (
            <PrivacyScoreSegment width={23.7959} />
          )}
          {/* Red zone (segment 2): gray portion then red portion */}
          {38.2041 - privacyScoreBar.redFillWidth > 0 && (
            <PrivacyScoreSegment width={38.2041 - privacyScoreBar.redFillWidth} />
          )}
          {privacyScoreBar.redFillWidth > 0 && (
            <PrivacyScoreSegment width={privacyScoreBar.redFillWidth} color='#BA6B5D' />
          )}
          {/* Green zone (segment 3): green portion then gray portion */}
          {privacyScoreBar.greenFillWidth > 0 && (
            <PrivacyScoreSegment width={privacyScoreBar.greenFillWidth} color='#7D9C40' />
          )}
          {43.291 - privacyScoreBar.greenFillWidth > 0 && (
            <PrivacyScoreSegment width={43.291 - privacyScoreBar.greenFillWidth} />
          )}
          {/* Segment 4: Gray unless green is at max, then green */}
          {privacyScoreBar.greenFillWidth >= 43.291 ? (
            <PrivacyScoreSegment width={18.709} color='#7D9C40' />
          ) : (
            <PrivacyScoreSegment width={18.709} />
          )}
          <PrivacyScoreVerticalLine />
        </PrivacyScoreBar>
      </PoolStatsBottom>
    </PoolCardContainer>
  );
};

type SortOption = 'most-popular' | 'most-private' | 'most-deposits' | 'most-uniform';

export const AllPoolsStats = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most-popular');
  const [sortSelectOpen, setSortSelectOpen] = useState(false);
  const aspUrl = getConfig().env.ASP_ENDPOINT;

  // Build list of all pools to query
  const allPoolsToQuery = useMemo(() => {
    const pools: Array<{ chainId: number; scope: string; aspUrl: string; poolInfo: PoolInfo }> = [];
    Object.entries(chainData).forEach(([cId, chain]) => {
      chain.poolInfo.forEach((poolInfo: PoolInfo) => {
        pools.push({
          chainId: parseInt(cId),
          scope: poolInfo.scope.toString(),
          aspUrl,
          poolInfo,
        });
      });
    });
    return pools;
  }, [aspUrl]);

  // Get unique chain IDs for fetching pools-stats
  const uniqueChainIds = useMemo(() => {
    return Array.from(new Set(allPoolsToQuery.map((pool) => pool.chainId)));
  }, [allPoolsToQuery]);

  // Fetch pool info for each individual pool
  const poolInfoQueries = useQueries({
    queries: allPoolsToQuery.map((pool) => ({
      queryKey: ['asp_pool_info', pool.chainId, pool.scope, pool.aspUrl],
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
      queryKey: ['asp_pools_stats', chainId, aspUrl],
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
      const pool = allPoolsToQuery[index];
      const key = `${pool.chainId}-${pool.scope}`;

      // Merge growth24h data from poolStatsQueries
      const growth24h = growthDataMap.get(key);
      map.set(key, {
        ...query.data,
        growth24h,
      });
    });

    return map;
  }, [poolInfoQueries, poolStatsQueries, allPoolsToQuery, uniqueChainIds]);

  // Build pool list dynamically from chainData with real stats
  const allPools = useMemo(() => {
    const pools: PoolCardData[] = [];

    Object.entries(chainData).forEach(([cId, chain]) => {
      // Get all pools from this chain's poolInfo
      chain.poolInfo.forEach((poolInfo: PoolInfo) => {
        const dataKey = `${cId}-${poolInfo.scope}`;
        const poolData = poolDataMap.get(dataKey);

        const totalFunds = poolData?.totalInPoolValue ? BigInt(poolData.totalInPoolValue) : BigInt(0);
        // Funds pending = total deposits - funds in pool
        const fundsPending =
          poolData?.totalDepositsValue && poolData?.totalInPoolValue
            ? BigInt(poolData.totalDepositsValue) - BigInt(poolData.totalInPoolValue)
            : BigInt(0);

        // Parse totalInPoolValueUsd from the API
        const totalFundsUSD = poolData?.totalInPoolValueUsd
          ? parseFloat(poolData.totalInPoolValueUsd.replace(/,/g, ''))
          : undefined;

        pools.push({
          poolName: `${chain.name} - ${poolInfo.asset} Pool`,
          icon: poolInfo.icon,
          asset: poolInfo.asset,
          chainId: parseInt(cId),
          scope: poolInfo.scope.toString(),
          totalFunds,
          fundsPending,
          totalFundsUSD,
          decimals: poolInfo.assetDecimals || 18,
          growthPercentage: poolData?.growth24h ?? undefined,
          acceptedDepositsCount: poolData?.acceptedDepositsCount || 0,
          depositVarianceScore: calculateDepositVarianceScore(poolData),
        });
      });
    });

    return pools;
  }, [poolDataMap]);

  // Filter and sort pools based on search query and sort option
  const filteredPools = useMemo(() => {
    let pools = allPools;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      pools = pools.filter(
        (pool) =>
          pool.poolName.toLowerCase().includes(query) ||
          pool.asset.toLowerCase().includes(query) ||
          chainData[pool.chainId]?.name.toLowerCase().includes(query),
      );
    }

    // Sort pools based on selected option
    const sortedPools = [...pools].sort((a, b) => {
      switch (sortBy) {
        case 'most-popular': {
          // Sort by total funds in USD (descending)
          const aFundsUSD = Number(formatUnits(a.totalFunds, a.decimals)) * 2500;
          const bFundsUSD = Number(formatUnits(b.totalFunds, b.decimals)) * 2500;
          return bFundsUSD - aFundsUSD;
        }

        case 'most-private': {
          // Calculate privacy scores for comparison
          const aFundsUSD = Number(formatUnits(a.totalFunds, a.decimals)) * 2500;
          const bFundsUSD = Number(formatUnits(b.totalFunds, b.decimals)) * 2500;

          // Simple privacy score: combination of funds position and deposit quality
          const getPrivacyScore = (fundsUSD: number, deposits: number, uniformity: number) => {
            const ONE_MILLION = 1_000_000;
            const HUNDRED_MILLION = 100_000_000;

            let fundsScore = 0;
            if (fundsUSD >= HUNDRED_MILLION) {
              fundsScore = 1;
            } else if (fundsUSD > ONE_MILLION) {
              const logMin = Math.log10(ONE_MILLION);
              const logMax = Math.log10(HUNDRED_MILLION);
              const logValue = Math.log10(fundsUSD);
              fundsScore = (logValue - logMin) / (logMax - logMin);
            }

            const MIN_DEPOSITS = 1;
            const MAX_DEPOSITS = 1000;
            let depositScore = 0;
            if (deposits > 0) {
              const logMin = Math.log10(MIN_DEPOSITS);
              const logMax = Math.log10(MAX_DEPOSITS);
              const logValue = Math.log10(Math.min(deposits, MAX_DEPOSITS));
              depositScore = Math.max(0.1, (logValue - logMin) / (logMax - logMin));
            }

            return (fundsScore + depositScore + uniformity) / 3;
          };

          const aScore = getPrivacyScore(aFundsUSD, a.acceptedDepositsCount, a.depositVarianceScore);
          const bScore = getPrivacyScore(bFundsUSD, b.acceptedDepositsCount, b.depositVarianceScore);

          return bScore - aScore;
        }

        case 'most-deposits':
          // Sort by number of accepted deposits (descending)
          return b.acceptedDepositsCount - a.acceptedDepositsCount;

        case 'most-uniform':
          // Sort by deposit uniformity score (descending)
          return b.depositVarianceScore - a.depositVarianceScore;

        default:
          return 0;
      }
    });

    return sortedPools;
  }, [allPools, searchQuery, sortBy]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSortChange = (e: SelectChangeEvent<unknown>) => {
    setSortBy(e.target.value as SortOption);
  };

  return (
    <PAContainer>
      <Section width='100%'>
        <HeaderSection>
          <Stack direction='row' alignItems='center' gap={1}>
            <Typography variant='h6' fontWeight='bold'>
              All Pools
            </Typography>
            <Typography variant='caption' fontWeight='bold' color='text.secondary'>
              ({filteredPools.length})
            </Typography>
          </Stack>

          <Stack direction='row' alignItems='center' gap={2}>
            <SortSelect
              value={sortBy}
              onChange={handleSortChange}
              size='small'
              open={sortSelectOpen}
              onOpen={() => setSortSelectOpen(true)}
              onClose={() => setSortSelectOpen(false)}
              IconComponent={() => null}
              renderValue={(value) => {
                const labels = {
                  'most-popular': 'Most Popular',
                  'most-private': 'Most Private',
                  'most-deposits': 'Most Deposits',
                  'most-uniform': 'Most Uniform',
                };
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{labels[value as SortOption]}</span>
                    <svg
                      width='20'
                      height='20'
                      viewBox='0 0 20 20'
                      fill='none'
                      xmlns='http://www.w3.org/2000/svg'
                      style={{
                        transform: sortSelectOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      <path
                        d='M6.17917 7.15414L10 10.975L13.8208 7.15414L15 8.33331L10 13.3333L5 8.33331L6.17917 7.15414Z'
                        fill='#282828'
                      />
                    </svg>
                  </Box>
                );
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': {
                      fontSize: '12px',
                    },
                  },
                },
              }}
            >
              <MenuItem value='most-popular'>Most Popular</MenuItem>
              <MenuItem value='most-private'>Most Private</MenuItem>
              <MenuItem value='most-deposits'>Most Deposits</MenuItem>
              <MenuItem value='most-uniform'>Most Uniform</MenuItem>
            </SortSelect>

            <SearchField
              placeholder='Search Pool'
              value={searchQuery}
              onChange={handleSearchChange}
              size='small'
              InputProps={{
                startAdornment: (
                  <InputAdornment position='start'>
                    <SearchIcon fontSize='small' />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </HeaderSection>
      </Section>

      <PoolsGridContainer>
        <PoolsGrid container spacing={0}>
          {filteredPools.map((pool, index) => (
            <Grid item xs={12} sm={6} key={`${pool.chainId}-${pool.scope}-${index}`}>
              <PoolCard pool={pool} isLeftColumn={index % 2 === 0} isFirstRow={index < 2} />
            </Grid>
          ))}
        </PoolsGrid>
      </PoolsGridContainer>

      {filteredPools.length === 0 && (
        <Section width='100%'>
          <Typography variant='body2' color='text.secondary' textAlign='center'>
            No pools found matching &quot;{searchQuery}&quot;
          </Typography>
        </Section>
      )}
    </PAContainer>
  );
};

const HeaderSection = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  marginBottom: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
  },
}));

const SortSelect = styled(Select)(({ theme }) => ({
  minWidth: '150px',
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '16px',
  color: '#202224',
  backgroundColor: theme.palette.background.paper,
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiSelect-select': {
    fontWeight: 400,
    fontSize: '12px',
    lineHeight: '16px',
    color: '#202224',
  },
}));

const SearchField = styled(TextField)(({ theme }) => ({
  minWidth: '250px',
  '& .MuiOutlinedInput-root': {
    backgroundColor: theme.palette.background.paper,
  },
  [theme.breakpoints.down('sm')]: {
    width: '100%',
  },
}));

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
  // Left column gets left border (outer edge) and right border (middle divider)
  // Right column gets right border (outer edge)
  //  borderLeft: isLeftColumn ? `1px solid ${theme.palette.grey[600]}` : 'none',
  borderRight: isLeftColumn ? `1px solid ${theme.palette.grey[600]}` : 'none',
  // Add top border for rows after the first to separate them
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

const GrowthIndicator = styled(Stack, {
  shouldForwardProp: (prop) => prop !== 'positive',
})<{ positive?: boolean }>(({ positive }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  color: positive ? '#7D9C40' : '#BA6B5D',
  '& .MuiSvgIcon-root': {
    fontSize: '16px',
    width: '16px',
    height: '16px',
  },
}));

const GrowthPercentage = styled('span', {
  shouldForwardProp: (prop) => prop !== 'positive',
})<{ positive?: boolean }>(({ positive }) => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: positive ? '#7D9C40' : '#BA6B5D',
}));

const GrowthTimeframe = styled('span')(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const PoolStats = styled(Stack)(() => ({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
  gap: '16px',
  marginBottom: '0px',
}));

const PoolStatsBottom = styled(Stack)(() => ({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  gap: '16px',
}));

const StatLabel = styled(Typography)(({ theme }) => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
}));

const TotalFundsValue = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: theme.palette.text.primary,
}));

const PrivacyScoreBar = styled(Box)(() => ({
  position: 'relative',
  width: '124px',
  height: '16px',
  display: 'flex',
}));

const PrivacyScoreSegment = styled('div', {
  shouldForwardProp: (prop) => prop !== 'width' && prop !== 'color',
})<{ width: number; color?: string }>(({ theme, width, color }) => ({
  width: `${width}px`,
  height: '10px',
  marginTop: '3px',
  backgroundColor: color || theme.palette.grey[200],
}));

const PrivacyScoreVerticalLine = styled('div')(() => ({
  position: 'absolute',
  left: '62px',
  top: 0,
  width: '2px',
  height: '16px',
  backgroundColor: '#4D4D4D',
}));
