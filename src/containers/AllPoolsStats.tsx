'use client';

import React, { useState, useMemo } from 'react';
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
import { useQueries, useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { ChainFilterSelect } from '~/components/ChainFilterSelect';
import { InfoTooltip } from '~/components/InfoTooltip';
import { allPoolsChainData, chainData, getConfig, PoolInfo } from '~/config';
import { PAContainer, Section } from '~/containers';
import { useChainContext } from '~/hooks';
import type { PoolResponse } from '~/types';
import { aspClient, fetchFxnPrice } from '~/utils';
import type { PoolStats } from '~/utils/aspClient';

export interface PoolCardData {
  poolName: string;
  icon?: string;
  asset: string;
  chainId: number;
  chainName: string; // Name of the chain (e.g., "Ethereum", "Sepolia")
  chainIcon?: string; // Icon for the chain
  scope: string;
  totalFunds: bigint;
  fundsPending: bigint;
  totalFundsUSD?: number;
  growthPercentage?: number;
  decimals: number;
  acceptedDepositsCount: number;
  depositVarianceScore: number; // 0-1, where 1 is best (low variance)
  originalKey?: string; // Optional: the original key from poolAccountsByChainScope for lookups
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

// Calculate numeric privacy score for sorting (0-1 scale)
export const calculatePrivacyScoreValue = (fundsUSD: number, deposits: number, uniformity: number): number => {
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
  const SIDE_WIDTH = 62; // Each side (red and green) is 62px wide

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
    return { redFillWidth: 0, greenFillWidth: SIDE_WIDTH * privacyMultiplier };
  } else if (totalFundsUSD > ONE_MILLION) {
    // Green zone: logarithmic scale from 1M to 100M, adjusted by privacy multiplier
    const logMin = Math.log10(ONE_MILLION);
    const logMax = Math.log10(HUNDRED_MILLION);
    const logValue = Math.log10(totalFundsUSD);
    const percentage = (logValue - logMin) / (logMax - logMin);
    return { redFillWidth: 0, greenFillWidth: SIDE_WIDTH * percentage * privacyMultiplier };
  } else if (totalFundsUSD > 0) {
    // Red zone: linear scale from 0 to 1M (lower funds = more red)
    // Inverse privacy multiplier: worse privacy quality = more red
    const fundsPercentage = (ONE_MILLION - totalFundsUSD) / ONE_MILLION;
    // Inverse the privacy multiplier (1.1 - x maps 1.0->0.1 and 0.1->1.0)
    const inversePrivacyMultiplier = 1.1 - privacyMultiplier;
    return { redFillWidth: SIDE_WIDTH * fundsPercentage * inversePrivacyMultiplier, greenFillWidth: 0 };
  } else {
    // Max red (no funds)
    // Still affected by privacy quality - worse quality = more red
    const inversePrivacyMultiplier = 1.1 - privacyMultiplier;
    return { redFillWidth: SIDE_WIDTH * inversePrivacyMultiplier, greenFillWidth: 0 };
  }
};

// Assets that have incentives and APR display.
// Empty list — FXN incentives ended. Keep the list-based gate so new
// incentive programs can be added by appending an asset name.
const INCENTIVIZED_ASSETS: string[] = [];

// FXN incentives configuration
const FXUSD_INCENTIVES_CONFIG = {
  fxnPerMonth: 75, // 75 FXN distributed per month (epoch)
  tvlThresholdUsd: 200_000, // Below this TVL, rewards roll over
};

// APR calculation result with rollover info
interface AprResult {
  apr: number;
  isRolloverActive: boolean;
  monthlyBudgetUsd: number;
}

const PoolCard = ({
  pool,
  isLeftColumn,
  isFirstRow,
  aprResult,
}: {
  pool: PoolCardData;
  isLeftColumn: boolean;
  isFirstRow: boolean;
  aprResult?: AprResult;
}) => {
  const router = useRouter();

  // Use totalFundsUSD from API (totalInPoolValueUsd)
  const totalFundsUSD = pool.totalFundsUSD ?? 0;

  const totalFundsDisplay = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalFundsUSD);

  const hasGrowth = pool.growthPercentage !== undefined && pool.growthPercentage !== 0;
  const isPositiveGrowth = (pool.growthPercentage || 0) > 0;
  const hasIncentives = INCENTIVIZED_ASSETS.includes(pool.asset);

  // HIDDEN: Privacy score calculations (commented out to hide privacy score)
  // const privacyScoreBar = calculatePrivacyScore(totalFundsUSD, pool.acceptedDepositsCount, pool.depositVarianceScore);
  // const privacyScoreValue = calculatePrivacyScoreValue(
  //   totalFundsUSD,
  //   pool.acceptedDepositsCount,
  //   pool.depositVarianceScore,
  // );

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <PoolCardContainer isLeftColumn={isLeftColumn} isFirstRow={isFirstRow} onClick={handleClick}>
      <PoolHeader>
        <Stack direction='row' alignItems='center' gap={1}>
          <IconWrapper>
            {pool.icon && <Image src={pool.icon} alt={pool.asset} width={24} height={24} />}
            {pool.chainIcon && (
              <ChainIconOverlay>
                <Image src={pool.chainIcon} alt={pool.chainName} width={14} height={14} />
              </ChainIconOverlay>
            )}
          </IconWrapper>
          <Stack direction='row' alignItems='center' gap={1}>
            <PoolName variant='body1'>{pool.asset} Pool</PoolName>
            <ChainName variant='body1'>{pool.chainName}</ChainName>
          </Stack>
        </Stack>
        <Stack direction='row' alignItems='center' gap={1}>
          {hasIncentives && aprResult && aprResult.apr > 0 && (
            <APRTag isRollover={aprResult.isRolloverActive}>
              <APRText>{aprResult.apr.toFixed(0)}% APR</APRText>
              {aprResult.isRolloverActive && <RolloverBadge>Rollover</RolloverBadge>}
              <InfoTooltip
                message={`Estimated APR from FXN incentives. ${aprResult.isRolloverActive ? 'Rewards roll over when TVL is below $200k. ' : ''}Only the first deposit per address per epoch is eligible.`}
                iconWidth={12}
                iconHeight={12}
              />
            </APRTag>
          )}
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
        </Stack>
      </PoolHeader>

      <PoolStats>
        <StatLabel>Total funds</StatLabel>
        {/* HIDDEN: Privacy score label and tooltip */}
        {/* <Stack direction='row' alignItems='center' gap='4px'>
          <StatLabel>Privacy score</StatLabel>
          <InfoTooltip
            message={`Privacy score: ${(privacyScoreValue * 100).toFixed(1)}% - Based on pool size (${(pool.acceptedDepositsCount || 0).toLocaleString()} deposits), total funds, and deposit uniformity (${Math.round(pool.depositVarianceScore * 100)}%)`}
          />
        </Stack> */}
      </PoolStats>

      <PoolStatsBottom>
        <Stack direction='row' alignItems='center' gap='4px'>
          <TotalFundsValue>{totalFundsDisplay}</TotalFundsValue>
          <InfoTooltip message='Total funds in the pool' iconWidth={14} iconHeight={14} />
        </Stack>
        {hasIncentives && (
          <IncentivesIndicator>
            <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
              <path
                d='M14 4H13V3C13 2.73478 12.8946 2.48043 12.7071 2.29289C12.5196 2.10536 12.2652 2 12 2H2C1.73478 2 1.48043 2.10536 1.29289 2.29289C1.10536 2.48043 1 2.73478 1 3V11C1 11.2652 1.10536 11.5196 1.29289 11.7071C1.48043 11.8946 1.73478 12 2 12H3V13C3 13.2652 3.10536 13.5196 3.29289 13.7071C3.48043 13.8946 3.73478 14 4 14H14C14.2652 14 14.5196 13.8946 14.7071 13.7071C14.8946 13.5196 15 13.2652 15 13V5C15 4.73478 14.8946 4.48043 14.7071 4.29289C14.5196 4.10536 14.2652 4 14 4ZM2 11V3H12V4H4C3.73478 4 3.48043 4.10536 3.29289 4.29289C3.10536 4.48043 3 4.73478 3 5V11H2ZM14 13H4V5H14V13ZM11 9C11 9.19778 10.9414 9.39112 10.8315 9.55557C10.7216 9.72002 10.5654 9.84819 10.3827 9.92388C10.2 9.99957 9.99889 10.0194 9.80491 9.98079C9.61093 9.9422 9.43275 9.84696 9.29289 9.70711C9.15304 9.56725 9.0578 9.38907 9.01922 9.19509C8.98063 9.00111 9.00043 8.80004 9.07612 8.61732C9.15181 8.43459 9.27998 8.27841 9.44443 8.16853C9.60888 8.05865 9.80222 8 10 8C10.2652 8 10.5196 8.10536 10.7071 8.29289C10.8946 8.48043 11 8.73478 11 9Z'
                fill='#4D4D4D'
              />
            </svg>
            <IncentivesText>Incentives</IncentivesText>
          </IncentivesIndicator>
        )}
        {/* HIDDEN: Privacy score bar */}
        {/* <PrivacyScoreBar>
          <PrivacyScoreSide width={62}>
            {privacyScoreBar.redFillWidth > 0 && (
              <PrivacyScoreFill width={privacyScoreBar.redFillWidth} color='#BA6B5D' align='right' />
            )}
          </PrivacyScoreSide>
          <PrivacyScoreVerticalLine />
          <PrivacyScoreSide width={62}>
            {privacyScoreBar.greenFillWidth > 0 && (
              <PrivacyScoreFill width={privacyScoreBar.greenFillWidth} color='#7D9C40' align='left' />
            )}
          </PrivacyScoreSide>
        </PrivacyScoreBar> */}
      </PoolStatsBottom>
    </PoolCardContainer>
  );
};

const FundsOnlyCard = ({
  pool,
  hasBorderTop,
  aprResult,
}: {
  pool: PoolCardData;
  hasBorderTop?: boolean;
  aprResult?: AprResult;
}) => {
  const router = useRouter();
  const hasIncentives = INCENTIVIZED_ASSETS.includes(pool.asset);

  const totalFundsUSD = pool.totalFundsUSD ?? 0;
  const totalFundsDisplay = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(totalFundsUSD);

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <SinglePoolCardContainer onClick={handleClick} hasBorderTop={hasBorderTop}>
      <PoolHeader>
        <Stack direction='row' alignItems='center' gap={1}>
          <IconWrapper>
            {pool.icon && <Image src={pool.icon} alt={pool.asset} width={24} height={24} />}
            {pool.chainIcon && (
              <ChainIconOverlay>
                <Image src={pool.chainIcon} alt={pool.chainName} width={14} height={14} />
              </ChainIconOverlay>
            )}
          </IconWrapper>
          <Stack direction='row' alignItems='center' gap={1}>
            <PoolName variant='body1'>{pool.asset} Pool</PoolName>
            <ChainName variant='body1'>{pool.chainName}</ChainName>
          </Stack>
        </Stack>
        {hasIncentives && aprResult && aprResult.apr > 0 && (
          <APRTag isRollover={aprResult.isRolloverActive}>
            <APRText>{aprResult.apr.toFixed(0)}% APR</APRText>
            {aprResult.isRolloverActive && <RolloverBadge>Rollover</RolloverBadge>}
            <InfoTooltip
              message={`Estimated APR from FXN incentives. ${aprResult.isRolloverActive ? 'Rewards roll over when TVL is below $200k. ' : ''}Only the first deposit per address per epoch is eligible.`}
              iconWidth={12}
              iconHeight={12}
            />
          </APRTag>
        )}
      </PoolHeader>

      <PoolStats>
        <StatLabel>Total funds</StatLabel>
      </PoolStats>

      <PoolStatsBottom>
        <Stack direction='row' alignItems='center' gap='4px'>
          <TotalFundsValue>{totalFundsDisplay}</TotalFundsValue>
          <InfoTooltip message='Total funds in the pool' iconWidth={14} iconHeight={14} />
        </Stack>
        {hasIncentives && (
          <IncentivesIndicator>
            <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
              <path
                d='M14 4H13V3C13 2.73478 12.8946 2.48043 12.7071 2.29289C12.5196 2.10536 12.2652 2 12 2H2C1.73478 2 1.48043 2.10536 1.29289 2.29289C1.10536 2.48043 1 2.73478 1 3V11C1 11.2652 1.10536 11.5196 1.29289 11.7071C1.48043 11.8946 1.73478 12 2 12H3V13C3 13.2652 3.10536 13.5196 3.29289 13.7071C3.48043 13.8946 3.73478 14 4 14H14C14.2652 14 14.5196 13.8946 14.7071 13.7071C14.8946 13.5196 15 13.2652 15 13V5C15 4.73478 14.8946 4.48043 14.7071 4.29289C14.5196 4.10536 14.2652 4 14 4ZM2 11V3H12V4H4C3.73478 4 3.48043 4.10536 3.29289 4.29289C3.10536 4.48043 3 4.73478 3 5V11H2ZM14 13H4V5H14V13ZM11 9C11 9.19778 10.9414 9.39112 10.8315 9.55557C10.7216 9.72002 10.5654 9.84819 10.3827 9.92388C10.2 9.99957 9.99889 10.0194 9.80491 9.98079C9.61093 9.9422 9.43275 9.84696 9.29289 9.70711C9.15304 9.56725 9.0578 9.38907 9.01922 9.19509C8.98063 9.00111 9.00043 8.80004 9.07612 8.61732C9.15181 8.43459 9.27998 8.27841 9.44443 8.16853C9.60888 8.05865 9.80222 8 10 8C10.2652 8 10.5196 8.10536 10.7071 8.29289C10.8946 8.48043 11 8.73478 11 9Z'
                fill='#4D4D4D'
              />
            </svg>
            <IncentivesText>Incentives</IncentivesText>
          </IncentivesIndicator>
        )}
      </PoolStatsBottom>
    </SinglePoolCardContainer>
  );
};

const GrowthOnlyCard = ({ pool, hasBorderTop }: { pool: PoolCardData; hasBorderTop?: boolean }) => {
  const router = useRouter();

  const hasGrowth = pool.growthPercentage !== undefined && pool.growthPercentage !== 0;
  const isPositiveGrowth = (pool.growthPercentage || 0) > 0;

  const handleClick = () => {
    router.push(`/pools/${pool.chainId}/${pool.asset.toLowerCase()}`);
  };

  return (
    <GrowthOnlyCardContainer onClick={handleClick} hasBorderTop={hasBorderTop}>
      {hasGrowth ? (
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
      ) : (
        <Typography variant='body2' color='text.secondary'>
          No change
        </Typography>
      )}
    </GrowthOnlyCardContainer>
  );
};

type SortOption = 'most-popular' | 'most-private' | 'most-deposits' | 'most-uniform';

export const AllPoolsStats = () => {
  const { selectedChainIds, setSelectedChainIds, allPoolsChains } = useChainContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most-popular');
  const [sortSelectOpen, setSortSelectOpen] = useState(false);
  const publicClient = usePublicClient({ chainId: 1 }); // Mainnet for Uniswap FXN price

  // Fetch FXN price for APR calculation
  const { data: fxnPrice } = useQuery({
    queryKey: ['fxn_price'],
    queryFn: () => fetchFxnPrice(publicClient!),
    enabled: !!publicClient,
    staleTime: 300000, // 5 minutes
    refetchInterval: 300000,
  });

  // Get ASP endpoints for test and non-test chains
  const { ASP_ENDPOINT_TEST, ASP_ENDPOINT_NON_TEST } = getConfig().env;

  // Fetch incentives stats for fxUSD pool (uses avg TVL for APR calculation)
  const fxusdPoolScope = chainData[1]?.poolInfo.find((p) => p.asset === 'fxUSD')?.scope?.toString();
  const { data: fxusdIncentivesStats } = useQuery({
    queryKey: ['pool_incentives_stats', fxusdPoolScope, ASP_ENDPOINT_NON_TEST],
    queryFn: () => aspClient.fetchPoolIncentivesStats(ASP_ENDPOINT_NON_TEST, 1, fxusdPoolScope!, 7),
    enabled: !!fxusdPoolScope,
    staleTime: 300000, // 5 minutes
    refetchInterval: 300000,
    retry: 2,
  });

  // Fetch pools-stats from both ASP endpoints (test and non-test)
  const poolStatsQuery = useQueries({
    queries: [
      {
        queryKey: ['asp_pools_stats', 'test', ASP_ENDPOINT_TEST],
        queryFn: () => aspClient.fetchPoolStats(ASP_ENDPOINT_TEST, 'all'),
        refetchInterval: 120000, // 2 minutes
        staleTime: 60000, // Consider data fresh for 60 seconds
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      {
        queryKey: ['asp_pools_stats', 'non_test', ASP_ENDPOINT_NON_TEST],
        queryFn: () => aspClient.fetchPoolStats(ASP_ENDPOINT_NON_TEST, 'all'),
        refetchInterval: 120000, // 2 minutes
        staleTime: 60000, // Consider data fresh for 60 seconds
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ],
  });

  // Build a map of pool stats by chainId and scope for easy lookup
  const poolStatsMap = useMemo(() => {
    const map = new Map<string, PoolStats>();

    // Merge pools from both test and non-test queries
    poolStatsQuery.forEach((query) => {
      if (!query.data?.pools) return;

      query.data.pools.forEach((poolStats) => {
        const key = `${poolStats.chainId}-${poolStats.scope}`;
        map.set(key, poolStats);
      });
    });

    return map;
  }, [poolStatsQuery]);

  // Build pool list dynamically from allPoolsChainData with real stats
  const allPools = useMemo(() => {
    const pools: PoolCardData[] = [];

    Object.entries(allPoolsChainData).forEach(([cId, chain]) => {
      // Get all pools from this chain's poolInfo
      chain.poolInfo.forEach((poolInfo: PoolInfo) => {
        const dataKey = `${cId}-${poolInfo.scope}`;
        const poolStats = poolStatsMap.get(dataKey);

        const totalFunds = poolStats?.totalInPoolValue ? BigInt(poolStats.totalInPoolValue) : BigInt(0);
        // Funds pending = total deposits - funds in pool
        const fundsPending =
          poolStats?.totalDepositsValue && poolStats?.totalInPoolValue
            ? BigInt(poolStats.totalDepositsValue) - BigInt(poolStats.totalInPoolValue)
            : BigInt(0);

        // Parse totalInPoolValueUsd from the API
        let totalFundsUSD: number | undefined;
        if (poolStats?.totalInPoolValueUsd) {
          const parsedUSD = parseFloat(poolStats.totalInPoolValueUsd.replace(/,/g, ''));
          if (parsedUSD > 0) {
            totalFundsUSD = parsedUSD;
          } else if (poolStats?.totalInPoolValue && poolInfo.isStableAsset) {
            // For stablecoins, if USD value is 0 but token value exists, use token value as USD (1:1)
            totalFundsUSD = Number(formatUnits(BigInt(poolStats.totalInPoolValue), poolInfo.assetDecimals || 18));
          }
        } else if (poolStats?.totalInPoolValue && poolInfo.isStableAsset) {
          // For stablecoins, if USD value is null/undefined but token value exists, use token value as USD (1:1)
          totalFundsUSD = Number(formatUnits(BigInt(poolStats.totalInPoolValue), poolInfo.assetDecimals || 18));
        }

        pools.push({
          poolName: `${chain.name} - ${poolInfo.asset} Pool`,
          icon: poolInfo.icon,
          asset: poolInfo.asset,
          chainId: parseInt(cId),
          chainName: chain.name,
          chainIcon: chain.image,
          scope: poolInfo.scope.toString(),
          totalFunds,
          fundsPending,
          totalFundsUSD,
          decimals: poolInfo.assetDecimals || 18,
          growthPercentage: poolStats?.growth24h ?? undefined,
          acceptedDepositsCount: poolStats?.acceptedDepositsCount || 0,
          depositVarianceScore: 0.5, // Default since we don't have recentEvents from pools-stats
        });
      });
    });

    return pools;
  }, [poolStatsMap]);

  // Calculate APR for incentivized pools using API data
  // APR = (monthly_incentive_usd * 12) / avg_tvl_usd
  // If avg TVL < $200k threshold, rewards roll over to next epoch
  const calculateApr = (pool: PoolCardData): AprResult | undefined => {
    if (!INCENTIVIZED_ASSETS.includes(pool.asset)) return undefined;
    if (!fxnPrice || fxnPrice === 0) return undefined;

    // Use API data for avgTvl and rollover status if available
    if (fxusdIncentivesStats?.pool && pool.asset === 'fxUSD') {
      const avgTvlUsd = parseFloat(fxusdIncentivesStats.pool.avgTvlUsd);
      if (avgTvlUsd === 0) return undefined;

      const { fxnPerMonth } = FXUSD_INCENTIVES_CONFIG;
      const monthlyBudgetUsd = fxnPerMonth * fxnPrice;
      const apr = ((monthlyBudgetUsd * 12) / avgTvlUsd) * 100;

      return {
        apr,
        isRolloverActive: fxusdIncentivesStats.pool.isRolloverActive,
        monthlyBudgetUsd,
      };
    }

    // Fallback to current TVL if API data not available
    const tvl = pool.totalFundsUSD ?? 0;
    if (tvl === 0) return undefined;

    const { fxnPerMonth, tvlThresholdUsd } = FXUSD_INCENTIVES_CONFIG;
    const monthlyBudgetUsd = fxnPerMonth * fxnPrice;
    const isRolloverActive = tvl < tvlThresholdUsd;
    const apr = ((monthlyBudgetUsd * 12) / tvl) * 100;

    return {
      apr,
      isRolloverActive,
      monthlyBudgetUsd,
    };
  };

  // Filter and sort pools based on search query, chain filter, and sort option
  const filteredPools = useMemo(() => {
    let pools = allPools;

    // Filter by selected chains
    if (selectedChainIds.length > 0) {
      pools = pools.filter((pool) => selectedChainIds.includes(pool.chainId));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      pools = pools.filter(
        (pool) =>
          pool.poolName.toLowerCase().includes(query) ||
          pool.asset.toLowerCase().includes(query) ||
          allPoolsChainData[pool.chainId]?.name.toLowerCase().includes(query),
      );
    }

    // Sort pools based on selected option
    const sortedPools = [...pools].sort((a, b) => {
      // TEMPORARY: Priority pools for Frax announcement (chain-specific)
      // Format: 'chainId-asset' (e.g., '1-ETH' for Ethereum mainnet ETH)
      const PRIORITY_POOLS: Array<{ chainId: number; asset: string }> = []; /*[
        { chainId: 1, asset: 'ETH' },     // Ethereum mainnet ETH
        { chainId: 1, asset: 'FRXUSD' },  // Ethereum mainnet frxUSD
        { chainId: 1, asset: 'USDC' },    // Ethereum mainnet USDC
      ];*/

      const aIsPriority = PRIORITY_POOLS.some(
        (p) => p.chainId === a.chainId && p.asset.toUpperCase() === a.asset.toUpperCase(),
      );
      const bIsPriority = PRIORITY_POOLS.some(
        (p) => p.chainId === b.chainId && p.asset.toUpperCase() === b.asset.toUpperCase(),
      );

      const aPriorityIndex = PRIORITY_POOLS.findIndex(
        (p) => p.chainId === a.chainId && p.asset.toUpperCase() === a.asset.toUpperCase(),
      );
      const bPriorityIndex = PRIORITY_POOLS.findIndex(
        (p) => p.chainId === b.chainId && p.asset.toUpperCase() === b.asset.toUpperCase(),
      );

      // Priority pools come first, sorted by their priority order
      if (aIsPriority && bIsPriority) {
        return aPriorityIndex - bPriorityIndex;
      } else if (aIsPriority) {
        return -1;
      } else if (bIsPriority) {
        return 1;
      }

      // Normal sorting logic (applies to non-priority pools)
      switch (sortBy) {
        case 'most-popular': {
          // Sort by total funds in USD (descending) - from API's totalInPoolValueUsd
          const aFundsUSD = a.totalFundsUSD ?? 0;
          const bFundsUSD = b.totalFundsUSD ?? 0;
          return bFundsUSD - aFundsUSD;
        }

        case 'most-private': {
          // Calculate privacy scores for comparison using the shared helper function
          const aScore = calculatePrivacyScoreValue(
            a.totalFundsUSD ?? 0,
            a.acceptedDepositsCount,
            a.depositVarianceScore,
          );
          const bScore = calculatePrivacyScoreValue(
            b.totalFundsUSD ?? 0,
            b.acceptedDepositsCount,
            b.depositVarianceScore,
          );

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
  }, [allPools, searchQuery, sortBy, selectedChainIds]);

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
          <Stack direction='row' alignItems='center' gap={2}>
            <Typography variant='h6' fontWeight='bold'>
              All Pools
            </Typography>
            <Typography variant='caption' fontWeight='bold' color='text.secondary'>
              ({filteredPools.length})
            </Typography>
            <ChainFilterSelect
              chains={allPoolsChains}
              selectedChainIds={selectedChainIds}
              onChange={setSelectedChainIds}
            />
          </Stack>

          <FilterRow>
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
          </FilterRow>
        </HeaderSection>
      </Section>

      <PoolsGridContainer>
        <PoolsGrid container spacing={0}>
          {filteredPools.map((pool, index, arr) => {
            const isOdd = arr.length % 2 === 1;
            const isLast = index === arr.length - 1;

            // If odd count and this is the last pool, show it with growth card beside it
            if (isOdd && isLast) {
              const needsBorderTop = arr.length > 2;
              return (
                <React.Fragment key={`${pool.chainId}-${pool.scope}-${index}`}>
                  <Grid item xs={12} sm={6}>
                    <FundsOnlyCard pool={pool} hasBorderTop={needsBorderTop} aprResult={calculateApr(pool)} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <GrowthOnlyCard pool={pool} hasBorderTop={needsBorderTop} />
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
                  aprResult={calculateApr(pool)}
                />
              </Grid>
            );
          })}
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
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
  },
}));

const FilterRow = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: theme.spacing(1),
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
    minWidth: 'unset',
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

const GrowthOnlyCardContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'hasBorderTop',
})<{ hasBorderTop?: boolean }>(({ theme, hasBorderTop }) => ({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
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
  fontSize: '14px',
  lineHeight: '100%',
  color: '#999',
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

// HIDDEN: Privacy score styled components (commented out)
// const PrivacyScoreSide = styled('div', {
//   shouldForwardProp: (prop) => prop !== 'width',
// })<{ width: number }>(({ theme, width }) => ({
//   position: 'relative',
//   width: `${width}px`,
//   height: '10px',
//   marginTop: '3px',
//   backgroundColor: theme.palette.grey[200],
//   overflow: 'hidden',
// }));

// const PrivacyScoreFill = styled('div', {
//   shouldForwardProp: (prop) => prop !== 'width' && prop !== 'color' && prop !== 'align',
// })<{ width: number; color: string; align: 'left' | 'right' }>(({ width, color, align }) => ({
//   position: 'absolute',
//   width: `${width}px`,
//   height: '100%',
//   backgroundColor: color,
//   [align]: 0,
//   top: 0,
// }));

// const PrivacyScoreVerticalLine = styled('div')(() => ({
//   position: 'absolute',
//   left: '62px',
//   top: 0,
//   width: '2px',
//   height: '16px',
//   backgroundColor: '#4D4D4D',
//   zIndex: 1,
// }));

const APRTag = styled(Stack, {
  shouldForwardProp: (prop) => prop !== 'isRollover',
})<{ isRollover?: boolean }>(({ isRollover }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '24px',
  padding: '4px 8px',
  backgroundColor: isRollover ? '#fff3cd' : '#dfecc6',
  borderRadius: '12px',
}));

const RolloverBadge = styled('span')(() => ({
  fontWeight: 500,
  fontSize: '10px',
  lineHeight: '100%',
  color: '#856404',
  backgroundColor: '#ffc107',
  padding: '2px 4px',
  borderRadius: '4px',
}));

const APRText = styled('span')(() => ({
  fontWeight: 600,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#000000',
}));

const IncentivesIndicator = styled(Stack)(() => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '31px',
}));

const IncentivesText = styled('span')(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));
