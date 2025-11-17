'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { Box, Grid, styled, Typography } from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { SafeAppWrapper } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { chainData, PoolInfo } from '~/config';
import { AllPoolsStats, PAContainer, Section } from '~/containers';
import { aspClient } from '~/utils';

interface PoolDistributionItem {
  asset: string;
  color: string;
  icon?: string;
  totalFundsUSD: number;
  percentage: number;
}

export const StatsPage = () => {
  // Build list of all pools to query
  const allPoolsToQuery = useMemo(() => {
    const pools: Array<{ chainId: number; scope: string; aspUrl: string; poolInfo: PoolInfo }> = [];
    Object.entries(chainData).forEach(([cId, chain]) => {
      chain.poolInfo.forEach((poolInfo: PoolInfo) => {
        pools.push({
          chainId: parseInt(cId),
          scope: poolInfo.scope.toString(),
          aspUrl: chain.aspUrl, // Get aspUrl from chain data
          poolInfo,
        });
      });
    });
    return pools;
  }, []);

  // Get unique chain IDs for fetching pools-stats
  const uniqueChainIds = useMemo(() => {
    return Array.from(new Set(allPoolsToQuery.map((pool) => pool.chainId)));
  }, [allPoolsToQuery]);

  // Fetch pool info for each individual pool
  const poolInfoQueries = useQueries({
    queries: allPoolsToQuery.map((pool) => ({
      queryKey: ['asp_pool_info', pool.chainId, pool.scope, pool.aspUrl],
      queryFn: () => aspClient.fetchPoolInfo(pool.aspUrl, pool.chainId, pool.scope),
      refetchInterval: 120000,
      staleTime: 60000,
      retryOnMount: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  // Fetch pools-stats for each chain to get growth24h data
  const poolStatsQueries = useQueries({
    queries: uniqueChainIds.map((chainId) => {
      const aspUrl = chainData[chainId]?.aspUrl;
      return {
        queryKey: ['stats_pools_stats', chainId, aspUrl],
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

  // Calculate total accepted and declined funds, and overall growth
  const { totalAcceptedUSD, totalDeclinedUSD, distributionData, growthPercentage, declinedGrowthPercentage } =
    useMemo(() => {
      let accepted = 0;
      let declined = 0;
      let totalValue24hAgo = 0;
      let totalDeclinedValue24hAgo = 0;
      const assetTotals: Record<string, { totalUSD: number; icon?: string; color?: string }> = {};

      // Build map of growth data by chainId and scope from poolStatsQueries
      const growthDataMap = new Map<string, number | null>();
      const pendingGrowthDataMap = new Map<string, number | null>();
      poolStatsQueries.forEach((query, index) => {
        if (!query.data?.pools) return;
        const chainId = uniqueChainIds[index];

        query.data.pools.forEach((poolStats) => {
          const key = `${chainId}-${poolStats.scope}`;
          growthDataMap.set(key, poolStats.growth24h ?? null);
          pendingGrowthDataMap.set(key, poolStats.pendingGrowth24h ?? null);
        });
      });

      poolInfoQueries.forEach((query, index) => {
        if (!query.data) return;
        const pool = allPoolsToQuery[index];
        const poolInfo = pool.poolInfo;
        const poolKey = `${pool.chainId}-${pool.scope}`;

        // Use totalInPoolValueUsd from API if available, otherwise fallback to calculation
        const acceptedUSD = query.data?.totalInPoolValueUsd
          ? parseFloat(query.data.totalInPoolValueUsd.replace(/,/g, ''))
          : (() => {
              const totalInPool = query.data?.totalInPoolValue ? BigInt(query.data.totalInPoolValue) : BigInt(0);
              const acceptedFormatted = Number(formatUnits(totalInPool, poolInfo.assetDecimals || 18));
              return acceptedFormatted * 2500;
            })();

        // Calculate pending (declined) USD value
        const pendingUSD =
          query.data?.totalDepositsValueUsd && query.data?.totalInPoolValueUsd
            ? parseFloat(query.data.totalDepositsValueUsd.replace(/,/g, '')) -
              parseFloat(query.data.totalInPoolValueUsd.replace(/,/g, ''))
            : (() => {
                const totalInPool = query.data?.totalInPoolValue ? BigInt(query.data.totalInPoolValue) : BigInt(0);
                const totalDeposits = query.data?.totalDepositsValue
                  ? BigInt(query.data.totalDepositsValue)
                  : BigInt(0);
                const pending = totalDeposits - totalInPool;
                const pendingFormatted = Number(formatUnits(pending > 0n ? pending : 0n, poolInfo.assetDecimals || 18));
                return pendingFormatted * 2500;
              })();

        accepted += acceptedUSD;
        declined += pendingUSD;

        // Calculate value 24h ago for growth calculation using growth data from poolStatsQueries
        const growth24h = growthDataMap.get(poolKey);
        if (growth24h !== null && growth24h !== undefined) {
          // Calculate previous value: currentValue / (1 + growth/100)
          const previousValue = acceptedUSD / (1 + growth24h / 100);
          totalValue24hAgo += previousValue;
        } else {
          // If no growth data, assume same value
          totalValue24hAgo += acceptedUSD;
        }

        // Calculate declined value 24h ago for growth calculation
        const pendingGrowth24h = pendingGrowthDataMap.get(poolKey);
        if (pendingGrowth24h !== null && pendingGrowth24h !== undefined) {
          // Calculate previous value: currentValue / (1 + growth/100)
          const previousDeclinedValue = pendingUSD / (1 + pendingGrowth24h / 100);
          totalDeclinedValue24hAgo += previousDeclinedValue;
        } else {
          // If no growth data, assume same value
          totalDeclinedValue24hAgo += pendingUSD;
        }

        // Track by asset for distribution
        if (!assetTotals[poolInfo.asset]) {
          assetTotals[poolInfo.asset] = { totalUSD: 0, icon: poolInfo.icon, color: poolInfo.color };
        }
        assetTotals[poolInfo.asset].totalUSD += acceptedUSD;
      });

      // Calculate overall growth percentage
      const overallGrowth = totalValue24hAgo > 0 ? ((accepted - totalValue24hAgo) / totalValue24hAgo) * 100 : null;

      // Calculate overall declined growth percentage
      const overallDeclinedGrowth =
        totalDeclinedValue24hAgo > 0 ? ((declined - totalDeclinedValue24hAgo) / totalDeclinedValue24hAgo) * 100 : null;

      // Calculate percentages and create distribution data
      const total = accepted;
      const distribution: PoolDistributionItem[] = Object.entries(assetTotals)
        .map(([asset, data]) => ({
          asset,
          color: data.color || '#999999',
          icon: data.icon,
          totalFundsUSD: data.totalUSD,
          percentage: total > 0 ? (data.totalUSD / total) * 100 : 0,
        }))
        .sort((a, b) => b.totalFundsUSD - a.totalFundsUSD);

      return {
        totalAcceptedUSD: accepted,
        totalDeclinedUSD: declined,
        distributionData: distribution,
        growthPercentage: overallGrowth,
        declinedGrowthPercentage: overallDeclinedGrowth,
      };
    }, [poolInfoQueries, poolStatsQueries, allPoolsToQuery, uniqueChainIds]);

  return (
    <SafeAppWrapper>
      <StatsPageContainer>
        <PAContainer>
          <Section width='100%'>
            <Typography variant='h6' fontWeight='bold' lineHeight='1'>
              All Pools Stats
            </Typography>
          </Section>

          <StatsContainer>
            <Grid container spacing={0}>
              {/* Left Section: Accepted and Declined Funds */}
              <Grid item xs={12} md={6}>
                <LeftSectionContainer>
                  {/* Accepted Funds */}
                  <StatsColumn item xs={12}>
                    <StatLabel>Value of Accepted Funds</StatLabel>
                    <StatValueRow>
                      <StatValue>
                        $
                        {totalAcceptedUSD.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </StatValue>
                      <InfoTooltip message='Total value of all accepted funds across all pools' />
                    </StatValueRow>
                    {growthPercentage !== null && (
                      <StatChange>
                        <TrendIcon>
                          {growthPercentage >= 0 ? (
                            <svg
                              width='16'
                              height='17'
                              viewBox='0 0 16 17'
                              fill='none'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path
                                d='M10 4.25V5.25H13.2929L9 9.54295L6.8535 7.3965C6.80709 7.35005 6.75199 7.3132 6.69133 7.28806C6.63067 7.26292 6.56566 7.24998 6.5 7.24998C6.43434 7.24998 6.36933 7.26292 6.30867 7.28806C6.24801 7.3132 6.19291 7.35005 6.1465 7.3965L1 12.5429L1.70705 13.25L6.5 8.45705L8.6465 10.6035C8.69291 10.6499 8.74801 10.6868 8.80867 10.7119C8.86932 10.7371 8.93434 10.75 9 10.75C9.06566 10.75 9.13068 10.7371 9.19133 10.7119C9.25199 10.6868 9.30709 10.6499 9.3535 10.6035L14 5.95705V9.25H15V4.25H10Z'
                                fill='#7D9C40'
                              />
                            </svg>
                          ) : (
                            <svg
                              width='16'
                              height='16'
                              viewBox='0 0 16 16'
                              fill='none'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path
                                d='M10 12V11H13.2929L9 6.70705L6.8535 8.8535C6.80709 8.89995 6.75199 8.9368 6.69133 8.96194C6.63067 8.98708 6.56566 9.00002 6.5 9.00002C6.43434 9.00002 6.36933 8.98708 6.30867 8.96194C6.24801 8.9368 6.19291 8.89995 6.1465 8.8535L1 3.70705L1.70705 3L6.5 7.79295L8.6465 5.6465C8.69291 5.60005 8.74801 5.5632 8.80867 5.53806C8.86932 5.51292 8.93434 5.49998 9 5.49998C9.06566 5.49998 9.13068 5.51292 9.19133 5.53806C9.25199 5.5632 9.30709 5.60005 9.3535 5.6465L14 10.293L14 7H15L15 12H10Z'
                                fill='#BA6B5D'
                              />
                            </svg>
                          )}
                        </TrendIcon>
                        <StatChangeText positive={growthPercentage >= 0}>
                          {Math.abs(growthPercentage).toFixed(1)}%
                        </StatChangeText>{' '}
                        <StatChangeTimeframe>past 24h</StatChangeTimeframe>
                      </StatChange>
                    )}
                  </StatsColumn>

                  {/* Declined Funds */}
                  <StatsColumn item xs={12} hasTopBorder>
                    <StatLabel>Value of Declined Funds</StatLabel>
                    <StatValueRow>
                      <StatValue>
                        $
                        {totalDeclinedUSD.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </StatValue>
                      <InfoTooltip message='Total value of all pending/declined funds across all pools' />
                    </StatValueRow>
                    {declinedGrowthPercentage !== null && (
                      <StatChange>
                        <TrendIcon>
                          {declinedGrowthPercentage >= 0 ? (
                            <svg
                              width='16'
                              height='17'
                              viewBox='0 0 16 17'
                              fill='none'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path
                                d='M10 4.25V5.25H13.2929L9 9.54295L6.8535 7.3965C6.80709 7.35005 6.75199 7.3132 6.69133 7.28806C6.63067 7.26292 6.56566 7.24998 6.5 7.24998C6.43434 7.24998 6.36933 7.26292 6.30867 7.28806C6.24801 7.3132 6.19291 7.35005 6.1465 7.3965L1 12.5429L1.70705 13.25L6.5 8.45705L8.6465 10.6035C8.69291 10.6499 8.74801 10.6868 8.80867 10.7119C8.86932 10.7371 8.93434 10.75 9 10.75C9.06566 10.75 9.13068 10.7371 9.19133 10.7119C9.25199 10.6868 9.30709 10.6499 9.3535 10.6035L14 5.95705V9.25H15V4.25H10Z'
                                fill='#7D9C40'
                              />
                            </svg>
                          ) : (
                            <svg
                              width='16'
                              height='16'
                              viewBox='0 0 16 16'
                              fill='none'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path
                                d='M10 12V11H13.2929L9 6.70705L6.8535 8.8535C6.80709 8.89995 6.75199 8.9368 6.69133 8.96194C6.63067 8.98708 6.56566 9.00002 6.5 9.00002C6.43434 9.00002 6.36933 8.98708 6.30867 8.96194C6.24801 8.9368 6.19291 8.89995 6.1465 8.8535L1 3.70705L1.70705 3L6.5 7.79295L8.6465 5.6465C8.69291 5.60005 8.74801 5.5632 8.80867 5.53806C8.86932 5.51292 8.93434 5.49998 9 5.49998C9.06566 5.49998 9.13068 5.51292 9.19133 5.53806C9.25199 5.5632 9.30709 5.60005 9.3535 5.6465L14 10.293L14 7H15L15 12H10Z'
                                fill='#BA6B5D'
                              />
                            </svg>
                          )}
                        </TrendIcon>
                        <StatChangeText positive={declinedGrowthPercentage >= 0}>
                          {Math.abs(declinedGrowthPercentage).toFixed(1)}%
                        </StatChangeText>{' '}
                        <StatChangeTimeframe>past 24h</StatChangeTimeframe>
                      </StatChange>
                    )}
                  </StatsColumn>
                </LeftSectionContainer>
              </Grid>

              {/* Right Section: Pie Chart and Distribution */}
              <Grid item xs={12} md={6}>
                <DistributionSection>
                  <DistributionHeader>
                    <DistributionHeaderLabel>Funds Distribution</DistributionHeaderLabel>
                    <DistributionTotalLabel>
                      Total $
                      {totalAcceptedUSD.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </DistributionTotalLabel>
                  </DistributionHeader>

                  <DistributionContent>
                    <PieChartContainer>
                      <PieChart data={distributionData} />
                    </PieChartContainer>

                    <DistributionList>
                      {distributionData.slice(0, 6).map((item) => (
                        <DistributionItem key={item.asset}>
                          <DistributionItemLeft>
                            {item.icon ? (
                              <TokenIcon>
                                <Image src={item.icon} alt={item.asset} width={16} height={16} />
                              </TokenIcon>
                            ) : (
                              <ColorDot color={item.color} />
                            )}
                            <DistributionAsset>{item.asset}</DistributionAsset>
                          </DistributionItemLeft>
                          <DistributionItemRight>
                            <DistributionPercentage>{item.percentage.toFixed(0)}%</DistributionPercentage>
                            <DistributionValue>
                              $
                              {item.totalFundsUSD.toLocaleString('en-US', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}
                            </DistributionValue>
                          </DistributionItemRight>
                        </DistributionItem>
                      ))}
                      {distributionData.length > 6 && (
                        <DistributionItem>
                          <DistributionItemLeft>
                            <ColorDot color='#999999' />
                            <DistributionAsset>Others</DistributionAsset>
                          </DistributionItemLeft>
                          <DistributionItemRight>
                            <DistributionPercentage>
                              {distributionData
                                .slice(6)
                                .reduce((sum, item) => sum + item.percentage, 0)
                                .toFixed(0)}
                              %
                            </DistributionPercentage>
                            <DistributionValue>
                              $
                              {distributionData
                                .slice(6)
                                .reduce((sum, item) => sum + item.totalFundsUSD, 0)
                                .toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </DistributionValue>
                          </DistributionItemRight>
                        </DistributionItem>
                      )}
                    </DistributionList>
                  </DistributionContent>
                </DistributionSection>
              </Grid>
            </Grid>
          </StatsContainer>
        </PAContainer>

        <AllPoolsStats />
      </StatsPageContainer>
    </SafeAppWrapper>
  );
};

// Pie Chart Component
const PieChart = ({ data }: { data: PoolDistributionItem[] }) => {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState({ x: 0, y: 0 });

  if (!data.length) return null;

  let currentAngle = 0;
  const radius = 85;
  const centerX = 86.5;
  const centerY = 85;
  const innerRadius = 76;
  const gapAngle = 2.5; // Gap between segments in degrees

  const createArc = (startAngle: number, endAngle: number) => {
    // Add small gaps between segments
    const adjustedStartAngle = startAngle + gapAngle / 2;
    const adjustedEndAngle = endAngle - gapAngle / 2;

    const start = polarToCartesian(centerX, centerY, radius, adjustedEndAngle);
    const end = polarToCartesian(centerX, centerY, radius, adjustedStartAngle);
    const innerStart = polarToCartesian(centerX, centerY, innerRadius, adjustedEndAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, adjustedStartAngle);

    const largeArcFlag = adjustedEndAngle - adjustedStartAngle <= 180 ? '0' : '1';

    return [
      'M',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
      'L',
      innerEnd.x,
      innerEnd.y,
      'A',
      innerRadius,
      innerRadius,
      0,
      largeArcFlag,
      1,
      innerStart.x,
      innerStart.y,
      'Z',
    ].join(' ');
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const handleMouseEnter = (index: number, event: React.MouseEvent<SVGPathElement>) => {
    setHoveredIndex(index);
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg width='173' height='170' viewBox='0 0 173 170' fill='none'>
        {data.map((item, index) => {
          const angle = (item.percentage / 100) * 360;
          const path = createArc(currentAngle, currentAngle + angle);
          currentAngle += angle;

          return (
            <path
              key={index}
              d={path}
              fill={item.color}
              style={{ cursor: 'pointer', opacity: hoveredIndex === index ? 0.8 : 1 }}
              onMouseEnter={(e) => handleMouseEnter(index, e)}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => handleMouseEnter(index, e)}
            />
          );
        })}
      </svg>
      {hoveredIndex !== null && (
        <PieTooltip
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <TooltipContent>
            <TooltipHeader>
              {data[hoveredIndex].icon && (
                <TooltipIcon>
                  <Image src={data[hoveredIndex].icon!} alt={data[hoveredIndex].asset} width={16} height={16} />
                </TooltipIcon>
              )}
              <TooltipAsset>{data[hoveredIndex].asset}</TooltipAsset>
            </TooltipHeader>
            <TooltipValue>
              $
              {data[hoveredIndex].totalFundsUSD.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </TooltipValue>
            <TooltipPercentage>{data[hoveredIndex].percentage.toFixed(0)}%</TooltipPercentage>
          </TooltipContent>
        </PieTooltip>
      )}
    </div>
  );
};

const StatsPageContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    gap: '2.4rem',
    marginTop: '2rem',
  };
});

const StatsContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  backgroundColor: theme.palette.background.paper,
}));

const LeftSectionContainer = styled(Grid)(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}));

const StatsColumn = styled(Grid, {
  shouldForwardProp: (prop) => prop !== 'hasTopBorder',
})<{ hasTopBorder?: boolean }>(({ theme, hasTopBorder }) => ({
  padding: '20px 24px',
  borderTop: hasTopBorder ? `1px solid ${theme.palette.grey[300]}` : 'none',
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
}));

const StatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '16px',
  color: '#4D4D4D',
  marginBottom: '8px',
}));

const StatValueRow = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
}));

const StatValue = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: '#000000',
  [theme.breakpoints.down('sm')]: {
    fontSize: '20px',
    lineHeight: '26px',
  },
}));

const StatChange = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}));

const TrendIcon = styled('span')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
}));

const StatChangeText = styled('span', {
  shouldForwardProp: (prop) => prop !== 'positive',
})<{ positive?: boolean }>(({ positive }) => ({
  fontWeight: 400,
  fontSize: '12px',
  color: positive ? '#7D9C40' : '#BA6B5D',
}));

const StatChangeTimeframe = styled('span')(() => ({
  fontWeight: 400,
  fontSize: '12px',
  color: '#4D4D4D',
}));

const DistributionSection = styled(Box)(({ theme }) => ({
  padding: '20px 16px 20px 24px',
  borderLeft: `1px solid ${theme.palette.grey[300]}`,
  height: '100%',
  overflow: 'hidden',
  [theme.breakpoints.down('md')]: {
    borderLeft: 'none',
    borderTop: `1px solid ${theme.palette.grey[300]}`,
    padding: '20px 24px',
  },
}));

const DistributionHeader = styled(Box)(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}));

const DistributionHeaderLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  color: '#4D4D4D',
}));

const DistributionTotalLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  color: '#4D4D4D',
}));

const DistributionContent = styled(Box)(() => ({
  display: 'flex',
  gap: '24px',
  alignItems: 'center',
}));

const PieChartContainer = styled(Box)(() => ({
  position: 'relative',
  flexShrink: 0,
}));

const DistributionList = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 1,
}));

const DistributionItem = styled(Box)(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}));

const DistributionItemLeft = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}));

const DistributionItemRight = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'right',
}));

const TokenIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  flexShrink: 0,
}));

const ColorDot = styled('div')<{ color: string }>(({ color }) => ({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: color,
  flexShrink: 0,
}));

const DistributionAsset = styled(Typography)(() => ({
  fontSize: '12px',
  fontWeight: 400,
  color: '#4D4D4D',
}));

const DistributionPercentage = styled(Typography)(() => ({
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '100%',
  color: '#737373',
  minWidth: '30px',
  textAlign: 'right',
}));

const DistributionValue = styled(Typography)(() => ({
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '100%',
  color: '#262626',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100px',
}));

const PieTooltip = styled('div')(() => ({
  background: '#FFFFFF',
  border: '1px solid #262626',
  borderRadius: '4px',
  padding: '16px',
  zIndex: 1000,
  pointerEvents: 'none',
  boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
}));

const TooltipContent = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '8px',
}));

const TooltipHeader = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}));

const TooltipIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  flexShrink: 0,
}));

const TooltipAsset = styled(Typography)(() => ({
  fontSize: '12px',
  fontWeight: 400,
  color: '#4D4D4D',
  lineHeight: '100%',
}));

const TooltipValue = styled(Typography)(() => ({
  fontSize: '16px',
  fontWeight: 700,
  color: '#262626',
  lineHeight: '1',
}));

const TooltipPercentage = styled(Typography)(() => ({
  fontSize: '12px',
  fontWeight: 400,
  color: '#737373',
  lineHeight: '1',
}));
