'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { TrendingUp as TrendingUpIcon, Close as CloseIcon } from '@mui/icons-material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  Box,
  Button,
  FormHelperText,
  Stack,
  styled,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Alert,
  AlertTitle,
  IconButton,
} from '@mui/material';
import { captureException, withScope } from '@sentry/nextjs';
import { useQuery, useQueries } from '@tanstack/react-query';
import { formatUnits, parseUnits, erc20Abi, encodeFunctionData } from 'viem';
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi';
import { allPoolsChainData, getConfig, chainData, PoolInfo } from '~/config';
import { getConstants } from '~/config/constants';
import { ChainTokenSelectorDropdown } from '~/containers/ChainTokenSelector';
import { useChainContext, useModal, usePoolAccountsContext, useStakingFeature, useNotifications } from '~/hooks';
import { ModalType } from '~/types';
import { formatDataNumber, calculateInitialDeposit, entrypointAbi, aspClient } from '~/utils';
import { getStakedTokenPreview } from '~/utils/alternativeTokenDeposit';
import type { PoolStats } from '~/utils/aspClient';
import { getBestYieldOpportunity, formatAPY } from '~/utils/poolUtils';
import { fetchSUSDSAPY } from '~/utils/sUSDSYield';
import { LinksSection } from '../LinksSection';
import { EtherIcon } from '~/assets/coins/ether';

const { ASP_OPTIONS } = getConstants();

export const DepositForm = () => {
  const { setModalOpen } = useModal();
  const { addNotification } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const [asp] = useState(ASP_OPTIONS[0]);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const isStakingEnabled = useStakingFeature();
  const {
    balanceBN: { symbol, formatted: balanceFormatted, decimals },
    price: currentPrice,
    maxDeposit,
    selectedPoolInfo,
    chainId,
    chain,
    setSelectedAsset,
    setChainId,
  } = useChainContext();
  const {
    amount,
    setAmount,
    minimumDepositAmount,
    vettingFeeBPS,
    isAssetConfigLoading,
    selectedAlternativeToken,
    setSelectedAlternativeToken,
  } = usePoolAccountsContext();
  const [inputAmount, setInputAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<'native' | 'alternative'>('native');
  const [showYieldAlert, setShowYieldAlert] = useState(() => {
    // Check if user has dismissed the alert before
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('yieldAlertDismissed');
      return dismissed !== 'true';
    }
    return true;
  });
  const [tokenSelectorAnchor, setTokenSelectorAnchor] = useState<HTMLElement | null>(null);

  // Sentry error wrapper (consistent with hooks)
  const logErrorToSentry = useCallback(
    (error: Error | unknown, context: Record<string, unknown> = {}) => {
      // Filter out expected user behavior errors (e.g., wallet rejection)
      if (error && typeof error === 'object') {
        const message = 'message' in error ? String(error.message) : '';
        const errorCode = 'code' in error ? (error as { code: unknown }).code : undefined;
        if (
          errorCode === 4001 ||
          message.includes('User rejected the request') ||
          message.includes('User denied') ||
          message.includes('User cancelled')
        ) {
          console.warn('Filtered user rejection error (not logging to Sentry)');
          return;
        }
      }

      withScope((scope) => {
        scope.setUser({ address });
        scope.setContext('switch_chain_context', {
          currentChainId: chainId,
          selectedAsset: selectedPoolInfo?.asset,
          ...context,
        });
        scope.setTag('operation', 'switch_chain');
        scope.setTag('chain_id', String(chainId ?? 'unknown'));
        captureException(error);
      });
    },
    [address, chainId, selectedPoolInfo?.asset],
  );

  // Fetch pools-stats from both ASP endpoints (test and non-test)
  const { ASP_ENDPOINT_TEST, ASP_ENDPOINT_NON_TEST } = getConfig().env;
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

  // Build list of all pools across all chains with their stats
  const allPools = useMemo(() => {
    const pools: Array<PoolInfo & { chainName: string; totalFundsUSD?: number }> = [];

    Object.entries(allPoolsChainData).forEach(([cId, chain]) => {
      chain.poolInfo.forEach((poolInfo: PoolInfo) => {
        const dataKey = `${cId}-${poolInfo.scope}`;
        const poolStats = poolStatsMap.get(dataKey);

        // Parse totalInPoolValueUsd from the API
        const totalFundsUSD = poolStats?.totalInPoolValueUsd
          ? parseFloat(poolStats.totalInPoolValueUsd.replace(/,/g, ''))
          : undefined;

        pools.push({
          ...poolInfo,
          chainName: chain.name,
          totalFundsUSD,
        });
      });
    });

    // Sort by priority first, then by totalFundsUSD descending (most popular first)
    // TEMPORARY: Priority pools for Frax announcement (chain-specific)
    const PRIORITY_POOLS: Array<{ chainId: number; asset: string }> = [
      { chainId: 1, asset: 'ETH' }, // Ethereum mainnet ETH
      { chainId: 1, asset: 'FRXUSD' }, // Ethereum mainnet frxUSD
      { chainId: 1, asset: 'USDC' }, // Ethereum mainnet USDC
    ];

    return pools.sort((a, b) => {
      // Check if pools are in priority list (chain-specific)
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
      }
      if (aIsPriority) return -1;
      if (bIsPriority) return 1;

      // Sort by totalFundsUSD for non-priority pools
      const aFundsUSD = a.totalFundsUSD ?? 0;
      const bFundsUSD = b.totalFundsUSD ?? 0;
      return bFundsUSD - aFundsUSD;
    });
  }, [poolStatsMap]);

  // Find yield opportunities for current token (only when staking is enabled)
  const yieldOpportunity = isStakingEnabled
    ? getBestYieldOpportunity(selectedPoolInfo?.asset || 'ETH', chain.poolInfo)
    : null;

  // Fetch real-time APY for sUSDS if it's the yield opportunity
  const { data: realTimeAPY } = useQuery({
    queryKey: ['sUSDS-APY', yieldOpportunity?.pool.assetAddress, chainId],
    queryFn: async () => {
      if (!yieldOpportunity || !publicClient || yieldOpportunity.pool.asset !== 'sUSDS') {
        return null;
      }
      const apy = await fetchSUSDSAPY(yieldOpportunity.pool.assetAddress, publicClient);
      return apy;
    },
    enabled: !!yieldOpportunity && !!publicClient && yieldOpportunity.pool.asset === 'sUSDS',
    refetchInterval: 60000, // Refresh every minute
  });

  // Use real-time APY if available, otherwise fall back to config
  const displayAPY =
    realTimeAPY !== null && realTimeAPY !== undefined ? realTimeAPY : yieldOpportunity?.pool.yield?.apy || 0;

  const shouldShowYieldAlert = isStakingEnabled && yieldOpportunity && showYieldAlert;

  // Handle dismissing the alert permanently
  const handleDismissAlert = () => {
    setShowYieldAlert(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('yieldAlertDismissed', 'true');
    }
  };

  // Fetch alternative token balance when selected
  const { data: alternativeTokenBalance } = useQuery({
    queryKey: ['alternativeTokenBalance', selectedAlternativeToken?.tokenAddress, address, chainId],
    queryFn: async () => {
      if (!selectedAlternativeToken || !address || !publicClient) return '0';
      const balance = await publicClient.readContract({
        address: selectedAlternativeToken.tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      });
      return formatUnits(balance as bigint, decimals);
    },
    enabled: !!selectedAlternativeToken && !!address && !!publicClient,
  });

  // Use alternative token balance when selected
  const effectiveBalance = selectedAlternativeToken ? alternativeTokenBalance || '0' : balanceFormatted;
  const effectiveBalanceBN = parseUnits(effectiveBalance, decimals);

  // Define displaySymbol early since it's used in multiple places
  const displaySymbol = selectedAlternativeToken ? selectedAlternativeToken.tokenSymbol : symbol;

  // Fetch sUSDS preview when using alternative token
  const { data: sUSDSPreview } = useQuery({
    queryKey: ['sUSDSPreview', amount, selectedAlternativeToken?.stakingContract, chainId],
    queryFn: async () => {
      if (!selectedAlternativeToken || !publicClient || !amount || amount === '0') return BigInt(0);
      try {
        const amountBN = parseUnits(amount, decimals);
        const preview = await getStakedTokenPreview(selectedAlternativeToken, amountBN, publicClient);
        return preview;
      } catch (error) {
        console.error('Error fetching sUSDS preview:', error);
        return BigInt(0);
      }
    },
    enabled: !!selectedAlternativeToken && !!publicClient && !!amount && amount !== '0',
  });

  const balanceUI = formatDataNumber(effectiveBalanceBN, decimals, 3, false, true, false);
  // const balanceFormatted = formatEther(BigInt(balanceBN));

  const stakingNote =
    isStakingEnabled && selectedAlternativeToken && sUSDSPreview
      ? ` (Will receive ${formatUnits(sUSDSPreview, decimals)} ${selectedPoolInfo?.asset})`
      : '';

  const isEnoughBalance = parseUnits(amount, decimals) <= effectiveBalanceBN;

  // For alternative tokens, validate that the resulting sUSDS amount meets minimum
  const effectiveAmountForValidation =
    selectedAlternativeToken && sUSDSPreview ? sUSDSPreview : parseUnits(amount, decimals);
  const isValidAmount = effectiveAmountForValidation >= minimumDepositAmount;

  const isMaxAmount =
    selectedAlternativeToken && sUSDSPreview
      ? sUSDSPreview > BigInt(maxDeposit)
      : parseUnits(inputAmount, decimals) > BigInt(maxDeposit);

  const amountHasError = !!Number(amount) && (!isValidAmount || !isEnoughBalance);
  const isDepositDisabled =
    !isEnoughBalance || !isValidAmount || amountHasError || isMaxAmount || !asp || isAssetConfigLoading;

  const errorMessage = useMemo(() => {
    if (!inputAmount) return '';
    if (!isValidAmount) {
      if (selectedAlternativeToken && sUSDSPreview) {
        const minSUSDS = formatUnits(minimumDepositAmount, decimals);
        const currentSUSDS = formatUnits(sUSDSPreview, decimals);
        return `Will receive ${currentSUSDS} ${selectedPoolInfo?.asset}, minimum required is ${minSUSDS} ${selectedPoolInfo?.asset}`;
      }
      return `Minimum deposit amount is ${formatUnits(minimumDepositAmount, decimals)} ${displaySymbol}`;
    }
    if (isMaxAmount) {
      if (selectedAlternativeToken && sUSDSPreview) {
        const maxSUSDS = formatUnits(BigInt(maxDeposit), decimals);
        const currentSUSDS = formatUnits(sUSDSPreview, decimals);
        return `Will receive ${currentSUSDS} ${selectedPoolInfo?.asset}, maximum allowed is ${maxSUSDS} ${selectedPoolInfo?.asset}`;
      }
      return `Maximum deposit amount is ${formatUnits(BigInt(maxDeposit), decimals)} ${displaySymbol}`;
    }
    if (!isEnoughBalance) return 'Insufficient balance';
    if (amountHasError) return 'Invalid amount';
    return '';
  }, [
    isValidAmount,
    minimumDepositAmount,
    displaySymbol,
    isEnoughBalance,
    amountHasError,
    inputAmount,
    maxDeposit,
    isMaxAmount,
    decimals,
    selectedAlternativeToken,
    sUSDSPreview,
    selectedPoolInfo?.asset,
  ]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits and a single decimal point
    let normalizedInput = e.target.value.replace(/[^0-9.]+/g, '').replace(/(\..*)\..*/g, '$1');

    // Enforce max 5 digits after the decimal point
    if (normalizedInput.includes('.')) {
      const [intPart, decPartRaw] = normalizedInput.split('.');
      const decPart = (decPartRaw || '').slice(0, 5);
      // Preserve trailing dot while typing (e.g., "22.")
      if (decPartRaw !== undefined && decPartRaw.length === 0) {
        normalizedInput = `${intPart}.`;
      } else {
        normalizedInput = decPart ? `${intPart}.${decPart}` : intPart;
      }
    }

    setInputAmount(normalizedInput);
  };

  const handleUseMax = async () => {
    // For native token deposits, we need to account for gas fees
    if (selectedPoolInfo?.isNativeToken && !selectedAlternativeToken && publicClient) {
      try {
        // Estimate gas for a deposit transaction
        // Using a dummy precommitment hash for estimation
        const dummyPrecommitment = BigInt('0x' + '1'.repeat(64));

        // Get current gas price
        const gasPrice = await publicClient.getGasPrice();

        // Estimate gas for ETH deposit
        let gasEstimate: bigint;
        try {
          // Encode the deposit function call
          const depositCallData = encodeFunctionData({
            abi: entrypointAbi,
            functionName: 'deposit',
            args: [dummyPrecommitment],
          });

          gasEstimate = await publicClient.estimateGas({
            account: address,
            to: selectedPoolInfo.entryPointAddress as `0x${string}`,
            value: parseUnits('0.001', decimals), // Use small amount for estimation
            data: depositCallData,
          });
        } catch {
          // Fallback gas estimate if estimation fails
          gasEstimate = 150000n; // Conservative estimate for deposit
        }

        // Add 50% buffer to gas estimate for safety (more conservative)
        const gasWithBuffer = (gasEstimate * 150n) / 100n;
        const totalGasCost = gasWithBuffer * gasPrice;

        // Add additional dust buffer (0.001 ETH) to prevent MetaMask rejection
        const dustBuffer = parseUnits('0.001', decimals);
        const totalBuffer = totalGasCost + dustBuffer;

        // Calculate the maximum balance available after gas and dust buffer
        const maxBalanceMinusGas = effectiveBalanceBN - totalBuffer;
        if (maxBalanceMinusGas <= 0n) {
          setInputAmount('0');
          return;
        }

        // The user inputs an amount, and the actual deposit will be calculateInitialDeposit(inputAmount)
        // calculateInitialDeposit formula: deposit = inputAmount / (1 - feeBPS/10000)
        // So to reverse it: inputAmount = deposit * (1 - feeBPS/10000)
        // For balance: inputAmount = (balance - gas) * (1 - feeBPS/10000)

        // Calculate the maximum input amount that would result in a valid deposit
        // Formula: maxInput = (balance - gas - dust) * (10000 - feeBPS) / 10000
        const maxInputAmount = (maxBalanceMinusGas * (10000n - vettingFeeBPS)) / 10000n;

        // Apply an additional 0.5% reduction to the final amount for extra safety
        const safeMaxInputAmount = (maxInputAmount * 989n) / 1000n;

        // Apply the pool's max deposit limit
        const finalMaxAmount = safeMaxInputAmount > BigInt(maxDeposit) ? BigInt(maxDeposit) : safeMaxInputAmount;

        // Convert to string and limit to 5 decimal places
        const maxAmountFormatted = formatUnits(finalMaxAmount, decimals);
        const [i, d = ''] = maxAmountFormatted.split('.');
        const limited = d ? `${i}.${d.slice(0, 5)}` : i;
        setInputAmount(limited);
      } catch (error) {
        console.error('Error calculating max with gas:', error);
        // Fallback to simple calculation if gas estimation fails
        // Reserve 0.015 ETH for gas and fees (more conservative)
        const simpleFallback = effectiveBalanceBN - parseUnits('0.015', decimals);
        const fallbackAmount = simpleFallback > 0n ? simpleFallback : 0n;
        // Apply correct fee calculation to the fallback amount
        const fallbackInputAmount = (fallbackAmount * (10000n - vettingFeeBPS)) / 10000n;
        const maxAllowedAmount = fallbackInputAmount > BigInt(maxDeposit) ? BigInt(maxDeposit) : fallbackInputAmount;
        const maxAmountFormatted = formatUnits(maxAllowedAmount, decimals);
        const [i, d = ''] = maxAmountFormatted.split('.');
        const limited = d ? `${i}.${d.slice(0, 5)}` : i;
        setInputAmount(limited);
      }
    } else {
      // For ERC20 tokens or alternative tokens, gas is paid in ETH so we can use full balance
      // But we need to account for the vetting fee that gets added on top of the input amount
      const balanceAsBN = parseUnits(effectiveBalance, decimals);
      const maxAllowedBN = balanceAsBN > BigInt(maxDeposit) ? BigInt(maxDeposit) : balanceAsBN;

      // Calculate max input that, when fees are added, equals the balance
      // Formula: maxInput = balance * (10000 - vettingFeeBPS) / 10000
      // This ensures: calculateInitialDeposit(maxInput) <= balance
      const maxInputAmount = (maxAllowedBN * (10000n - vettingFeeBPS)) / 10000n;

      const maxAmountFormatted = formatUnits(maxInputAmount, decimals);
      const [i, d = ''] = maxAmountFormatted.split('.');
      const limited = d ? `${i}.${d.slice(0, 5)}` : i;
      setInputAmount(limited);
    }
  };

  const handleDeposit = async () => {
    // For ERC20 deposits, check if user has enough ETH for gas
    if (selectedPoolInfo?.asset !== 'ETH' && !selectedPoolInfo?.isNativeToken) {
      if (publicClient && address) {
        try {
          // Get ETH balance
          const ethBalance = await publicClient.getBalance({ address });

          // Get current gas price
          const gasPrice = await publicClient.getGasPrice();

          // Estimate gas for ERC20 deposit transactions
          let gasEstimate: bigint;
          const value = parseUnits(amount, decimals);

          try {
            // Estimate gas for approval transaction
            const approvalGas = await publicClient.estimateGas({
              account: address,
              to: selectedPoolInfo.assetAddress as `0x${string}`,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [selectedPoolInfo.entryPointAddress, value],
              }),
            });

            // Estimate gas for deposit transaction
            const depositGas = await publicClient.estimateGas({
              account: address,
              to: selectedPoolInfo.entryPointAddress as `0x${string}`,
              data: encodeFunctionData({
                abi: entrypointAbi,
                functionName: 'deposit',
                args: [selectedPoolInfo.assetAddress, value, BigInt('0x' + '1'.repeat(64))], // dummy precommitment
              }),
            });

            // Total gas for both transactions
            gasEstimate = approvalGas + depositGas;
          } catch {
            // Fallback gas estimate if estimation fails
            gasEstimate = 200000n; // Conservative estimate for approval + deposit
          }

          // Add 50% buffer to gas estimate for safety
          const totalGasCost = ((gasEstimate * 150n) / 100n) * gasPrice;

          if (ethBalance < totalGasCost) {
            addNotification('error', 'Insufficient ETH balance to pay for gas fees');
            return null;
          }
        } catch (error) {
          console.error('Error checking ETH balance:', error);
          // Continue with deposit if check fails
        }
      }
    }

    setModalOpen(ModalType.REVIEW);
  };

  // Handle switching to yield-generating pool
  const handleSwitchToYieldDeposit = () => {
    if (yieldOpportunity) {
      // Switch to the yield pool
      setSelectedAsset(yieldOpportunity.pool.asset);
      setShowYieldAlert(false);
      // Reset amount
      setInputAmount('');
    }
  };

  // Handle token selection change
  const handleTokenChange = (_event: React.MouseEvent<HTMLElement>, newToken: 'native' | 'alternative' | null) => {
    if (newToken !== null) {
      setSelectedToken(newToken);
      if (newToken === 'alternative' && selectedPoolInfo?.alternativeTokens?.[0]) {
        setSelectedAlternativeToken(selectedPoolInfo.alternativeTokens[0]);
      } else {
        setSelectedAlternativeToken(null);
      }
      // Reset amount when switching tokens
      setInputAmount('');
    }
  };

  // Handle chain+token selection from dropdown
  const handleChainTokenSelect = async (selectedChainId: number, selectedAsset: string) => {
    // Find the selected pool from allPools
    const selectedPool = allPools.find(
      (p) => p.chainId === selectedChainId && p.asset.toLowerCase() === selectedAsset.toLowerCase(),
    );

    if (selectedPool) {
      // If selecting a pool from a different chain, trigger a wallet chain switch
      if (selectedPool.chainId !== chainId) {
        try {
          addNotification('info', `Switching to ${selectedPool.chainName}...`);
          await switchChainAsync({ chainId: selectedPool.chainId });
          // Update the app's chain context to match the wallet's chain
          setChainId(selectedPool.chainId);
          addNotification('success', `Switched to ${selectedPool.chainName}`);
        } catch (err) {
          // Fall back to instructing the user if automatic switch fails
          logErrorToSentry(err, {
            targetChainId: selectedPool.chainId,
            targetChainName: selectedPool.chainName,
            from: 'DepositForm Pool Select',
          });
          addNotification('error', `Please switch to ${selectedPool.chainName} to deposit to this pool`);
          return; // Don't proceed with asset selection if chain switch failed
        }
      }

      // Switch to the selected pool asset
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedAsset(selectedAsset as any);

      // Update URL if on a pool page
      if (pathname?.startsWith('/pools/')) {
        router.push(`/pools/${selectedChainId}/${selectedAsset.toLowerCase()}`);
      }
    }

    // Reset alternative token selection
    setSelectedAlternativeToken(null);
    setSelectedToken('native');
    // Reset amount
    setInputAmount('');
  };

  // Auto-select alternative token when switching to a yield pool that has the previous token as alternative
  useEffect(() => {
    if (isStakingEnabled && selectedPoolInfo?.alternativeTokens?.length) {
      // Check if this pool has alternative tokens and we should auto-select one
      const hasAlternativeTokens = selectedPoolInfo.alternativeTokens.length > 0;
      if (hasAlternativeTokens && selectedPoolInfo.yield) {
        // Auto-select the first alternative token for yield pools
        setSelectedToken('alternative');
        setSelectedAlternativeToken(selectedPoolInfo.alternativeTokens[0]);
      }
    }
  }, [
    isStakingEnabled,
    selectedPoolInfo?.asset,
    selectedPoolInfo?.alternativeTokens,
    selectedPoolInfo?.yield,
    setSelectedAlternativeToken,
  ]);

  useEffect(() => {
    const result = calculateInitialDeposit(parseUnits(inputAmount, decimals), vettingFeeBPS);
    setAmount(formatUnits(result, decimals));
  }, [inputAmount, setAmount, vettingFeeBPS, decimals]);

  return (
    <ModalContainer>
      <DecorativeCircle />

      <ModalTitle variant='h2'>Make a deposit</ModalTitle>

      {/* Yield Alert - show when depositing USDS and sUSDS pool is available */}
      {shouldShowYieldAlert && (
        <Alert
          severity='info'
          sx={{
            width: '100%',
            cursor: 'default',
            backgroundColor: 'rgba(2, 136, 209, 0.04)',
            border: '1px solid rgba(2, 136, 209, 0.2)',
          }}
          action={
            <IconButton
              aria-label='close'
              color='inherit'
              size='small'
              onClick={(e) => {
                e.stopPropagation();
                handleDismissAlert();
              }}
            >
              <CloseIcon fontSize='inherit' />
            </IconButton>
          }
          icon={<TrendingUpIcon />}
        >
          <AlertTitle sx={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1rem' }}>
            🚀 Earn {formatAPY(displayAPY)} APY on your {selectedPoolInfo?.asset} while in the pool!
          </AlertTitle>
          <Button
            onClick={handleSwitchToYieldDeposit}
            variant='contained'
            size='small'
            sx={{
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              color: 'white',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '20px',
              padding: '8px 16px',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                animation: 'shine 2s infinite',
              },
              '&:hover': {
                background: 'linear-gradient(45deg, #1976D2 30%, #1CB5E0 90%)',
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 8px rgba(33, 150, 243, 0.3)',
              },
              '@keyframes shine': {
                '0%': { left: '-100%' },
                '100%': { left: '100%' },
              },
            }}
          >
            Click here to enable yield earning!
          </Button>
        </Alert>
      )}

      {/* Token Selection Toggle - only show if alternative tokens are available and staking is enabled */}
      {isStakingEnabled && selectedPoolInfo?.alternativeTokens && selectedPoolInfo.alternativeTokens.length > 0 && (
        <Stack gap='1rem' width='100%' alignItems='center'>
          <Typography variant='caption' color='textSecondary'>
            Select deposit token
          </Typography>
          <ToggleButtonGroup
            value={selectedToken}
            exclusive
            onChange={handleTokenChange}
            size='small'
            sx={{ width: '100%' }}
          >
            <ToggleButton value='alternative' sx={{ flex: 1 }}>
              <Stack direction='row' alignItems='center' gap={1}>
                {selectedPoolInfo.alternativeTokens[0].tokenSymbol}
                <Chip label='Stake & Deposit' size='small' color='primary' />
              </Stack>
            </ToggleButton>
            <ToggleButton value='native' sx={{ flex: 1 }}>
              {selectedPoolInfo.asset}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}

      <InputContainer>
        <Stack direction='row' justifyContent='space-between' alignItems='flex-start' width='100%'>
          <Stack flexDirection='column' flex={1} gap='0.4rem'>
            <AmountInput
              id='amount'
              variant='outlined'
              placeholder='0'
              value={inputAmount}
              error={amountHasError}
              onChange={handleAmountChange}
              data-testid='deposit-input'
            />
            <UsdAmountText>
              {inputAmount && !isNaN(Number(inputAmount)) && currentPrice
                ? `$${(Number(inputAmount) * currentPrice).toFixed(2)}`
                : ''}
            </UsdAmountText>
          </Stack>

          <TokenSelectorContainer>
            <TokenSelectorButton onClick={(e) => setTokenSelectorAnchor(e.currentTarget)}>
              <Stack direction='row' alignItems='center' gap='8px'>
                <Box sx={{ position: 'relative', width: 24, height: 24 }}>
                  {selectedPoolInfo?.icon && (
                    <Image src={selectedPoolInfo.icon} alt={selectedPoolInfo.asset} width={24} height={24} />
                  )}
                  {chainData[chainId]?.image && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '1px solid #fff',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Image
                        src={chainData[chainId].image}
                        alt={chainData[chainId].name}
                        width={12}
                        height={12}
                        style={{ display: 'block' }}
                      />
                    </Box>
                  )}
                </Box>
                <Typography>{selectedPoolInfo?.asset || 'Select Pool'}</Typography>
              </Stack>
              <KeyboardArrowDownIcon sx={{ fontSize: 20, color: '#666' }} />
            </TokenSelectorButton>
            <ChainTokenSelectorDropdown
              selectedChainId={chainId}
              selectedAsset={selectedPoolInfo?.asset || ''}
              onSelect={handleChainTokenSelect}
              onClose={() => setTokenSelectorAnchor(null)}
              anchorEl={tokenSelectorAnchor}
            />
            <BalanceText onClick={handleUseMax} style={{ cursor: 'pointer' }}>
              Bal: {balanceUI} {displaySymbol}
            </BalanceText>
          </TokenSelectorContainer>
        </Stack>
        {isDepositDisabled && <FormHelperText error>{errorMessage}</FormHelperText>}
      </InputContainer>

      {/* ASP Fee Info */}
      <Typography variant='body2' color='textSecondary' sx={{ textAlign: 'center', zIndex: 0 }}>
        {asp} protection fee {(Number(vettingFeeBPS) / 100).toFixed(1)}%{stakingNote}
      </Typography>

      <Button
        disabled={isDepositDisabled}
        onClick={handleDeposit}
        data-testid='confirm-deposit-button'
        sx={{ zIndex: 0 }}
      >
        Deposit
      </Button>

      <LinksSection />
    </ModalContainer>
  );
};

export const ModalContainer = styled(Box)(() => {
  return {
    display: 'flex',
    padding: '3.6rem 2.4rem',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    '& > *': {
      zIndex: 1,
    },
  };
});

export const CoinIcon = styled(EtherIcon)(({ theme }) => {
  return {
    width: '5.4rem',
    height: '5.4rem',
    padding: '1.2rem',
    borderRadius: '50%',
    borderColor: theme.palette.primary.main,
    borderStyle: 'solid',
    borderWidth: '1px',
    backgroundColor: theme.palette.background.default,
    zIndex: 1,
  };
});

export const MaxButton = styled(Button)(({ theme }) => {
  return {
    padding: '0',
    color: theme.palette.grey[400],
    fontSize: '1.2rem',
    borderRadius: 0,
    minHeight: 'auto',
    height: 'auto',
    textTransform: 'none',
    textDecoration: 'underline',
    textUnderlineOffset: '0.3rem',
    minWidth: 'max-content',
  };
});

export const InputContainer = styled(Stack)(({ theme }) => {
  return {
    border: '1px solid #D9D9D9',
    borderRadius: '8px',
    backgroundColor: theme.palette.background.default,
    padding: '1.6rem',
    width: '100%',
  };
});

export const AmountInput = styled(TextField)(() => {
  return {
    padding: '0',
    width: '100%',
    '& .MuiOutlinedInput-root': {
      fontSize: '3.2rem',
      fontWeight: 400,
      width: '100%',
      borderRadius: 0,
      padding: 0,
      '& fieldset, & input': {
        border: 'none',
        padding: 0,
      },
      '&:hover fieldset': {
        border: 'none',
      },
      '&.Mui-focused fieldset': {
        border: 'none',
      },
    },
    '& input::placeholder': {
      opacity: 0.5,
    },
  };
});

const DecorativeCircle = styled(Box)(({ theme }) => {
  return {
    width: '647px',
    height: '646px',
    position: 'absolute',
    borderRadius: '50%',
    backgroundColor: theme.palette.background.default,
    border: '1px solid #D9D9D9',
    zIndex: 0,
    top: '78%',
  };
});

export const ModalTitle = styled(Typography)(() => {
  return {
    fontSize: '2.4rem',
    fontWeight: 700,
    lineHeight: 'normal',
    width: '100%',
    textAlign: 'center',
  };
});

export const ImageContainer = styled(Box)(({ theme }) => {
  return {
    width: '5.4rem',
    height: '5.4rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    borderColor: theme.palette.primary.main,
    borderStyle: 'solid',
    borderWidth: '1px',
    backgroundColor: theme.palette.background.default,
    zIndex: 1,
  };
});

const TokenSelectorContainer = styled(Stack)(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '4px',
  minWidth: '150px',
}));

const TokenSelectorButton = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.grey[300]}`,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  minWidth: '140px',
  '&:hover': {
    borderColor: theme.palette.grey[400],
  },
}));

const BalanceText = styled(Typography)(({ theme }) => ({
  fontSize: '12px',
  fontWeight: 400,
  color: theme.palette.grey[600],
  whiteSpace: 'nowrap',
  textAlign: 'right',
  '&:hover': {
    textDecoration: 'underline',
  },
}));

const UsdAmountText = styled(Typography)(({ theme }) => ({
  fontSize: '14px',
  fontWeight: 400,
  color: theme.palette.grey[600],
}));
