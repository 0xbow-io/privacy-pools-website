'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { TrendingUp as TrendingUpIcon, Close as CloseIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  SelectChangeEvent,
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
import { useQuery } from '@tanstack/react-query';
import { formatUnits, parseUnits, erc20Abi, encodeFunctionData } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { getConstants } from '~/config/constants';
import { useChainContext, useModal, usePoolAccountsContext, useStakingFeature } from '~/hooks';
import { ModalType } from '~/types';
import { formatDataNumber, getUsdBalance, calculateAspFee, calculateInitialDeposit, entrypointAbi } from '~/utils';
import { getStakedTokenPreview } from '~/utils/alternativeTokenDeposit';
import { getBestYieldOpportunity, formatAPY } from '~/utils/poolUtils';
import { fetchSUSDSAPY } from '~/utils/sUSDSYield';
import { LinksSection } from '../LinksSection';
import { EtherIcon } from '~/assets/coins/ether';

const { ASP_OPTIONS } = getConstants();

export const DepositForm = () => {
  const { setModalOpen } = useModal();
  const [asp, setAsp] = useState(ASP_OPTIONS[0]);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const isStakingEnabled = useStakingFeature();
  const {
    balanceBN: { symbol, formatted: balanceFormatted, decimals },
    price: currentPrice,
    maxDeposit,
    selectedPoolInfo,
    chainId,
    chain,
    setSelectedAsset,
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

  const fee = calculateAspFee(parseUnits(amount, decimals), vettingFeeBPS);
  const feeFormatted = formatDataNumber(fee, decimals);
  const feeUSD = getUsdBalance(currentPrice, formatUnits(fee, decimals), decimals);
  const feeText = `Fee ${feeFormatted} ${displaySymbol} ~ ${feeUSD} USD`;
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
    const normalizedInput = e.target.value.replace(/[^0-9.]+/g, '').replace(/(\..*)\..*/g, '$1');
    setInputAmount(normalizedInput.slice(0, 6));
  };

  const handleAspChange = (e: SelectChangeEvent<unknown>) => {
    setAsp(e.target.value as string);
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

        // Convert to string and limit precision
        const maxAmountFormatted = formatUnits(finalMaxAmount, decimals);
        setInputAmount(Number(maxAmountFormatted).toString().slice(0, 6));
      } catch (error) {
        console.error('Error calculating max with gas:', error);
        // Fallback to simple calculation if gas estimation fails
        // Reserve 0.015 ETH for gas and fees (more conservative)
        const simpleFallback = effectiveBalanceBN - parseUnits('0.015', decimals);
        const fallbackAmount = simpleFallback > 0n ? simpleFallback : 0n;
        // Apply correct fee calculation to the fallback amount
        const fallbackInputAmount = (fallbackAmount * (10000n - vettingFeeBPS)) / 10000n;
        const maxAllowedAmount = Math.min(
          Number(formatUnits(fallbackInputAmount, decimals)),
          Number(formatUnits(BigInt(maxDeposit), decimals)),
        );
        setInputAmount(maxAllowedAmount.toString().slice(0, 6));
      }
    } else {
      // For ERC20 tokens or alternative tokens, gas is paid in ETH so we can use full balance
      const maxAllowedAmount = Math.min(Number(formatUnits(BigInt(maxDeposit), decimals)), Number(effectiveBalance));
      setInputAmount(maxAllowedAmount.toString().slice(0, 6));
    }
  };

  const handleDeposit = () => {
    setModalOpen(ModalType.REVIEW);
  };

  const chainIcon = useMemo(() => {
    const iconSrc = selectedAlternativeToken ? selectedAlternativeToken.tokenIcon : selectedPoolInfo?.icon;
    const tokenSymbol = selectedAlternativeToken ? selectedAlternativeToken.tokenSymbol : symbol;

    if (selectedPoolInfo?.asset === 'ETH' && !selectedAlternativeToken) {
      return <CoinIcon />;
    }

    if (iconSrc) {
      return (
        <ImageContainer>
          <Image src={iconSrc} alt={tokenSymbol} width={54} height={34} />
        </ImageContainer>
      );
    }

    return (
      <ImageContainer>
        <span style={{ width: '5.4rem', height: '5.4rem', backgroundColor: 'transparent' }}></span>
      </ImageContainer>
    );
  }, [selectedPoolInfo?.asset, selectedPoolInfo?.icon, symbol, selectedAlternativeToken]);

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
        <Stack alignItems='center' flexDirection='column' width='100%'>
          <Stack direction='row' gap='0.8rem' alignItems='center' width='100%'>
            {chainIcon}

            <FormControl className='amount-input'>
              <AmountInput
                id='amount'
                variant='outlined'
                placeholder='0'
                value={inputAmount}
                error={amountHasError}
                onChange={handleAmountChange}
                data-testid='deposit-input'
              />
              <MaxButton onClick={handleUseMax} disableElevation variant='text'>
                Use Max
              </MaxButton>
            </FormControl>
          </Stack>
          {isDepositDisabled && <FormHelperText error>{errorMessage}</FormHelperText>}
        </Stack>

        <BalanceContainer>
          <Typography variant='body1' fontWeight='bold'>{`${balanceUI} ${displaySymbol}`}</Typography>
          <Typography variant='body1'>in your wallet</Typography>
        </BalanceContainer>
      </InputContainer>

      {/* ASP Selector */}
      <Stack gap='1.2rem' width='100%' alignItems='center'>
        <FormControl fullWidth>
          <SSelect id='asp-select' labelId='asp-select-label' value={asp} displayEmpty onChange={handleAspChange}>
            {ASP_OPTIONS.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SSelect>
        </FormControl>

        <Typography variant='body2' color='textSecondary'>
          {feeText}
          {stakingNote}
        </Typography>
      </Stack>

      <Button
        disabled={isDepositDisabled}
        onClick={handleDeposit}
        data-testid='confirm-deposit-button'
        sx={{ zIndex: 1 }}
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
    backgroundColor: theme.palette.background.default,
    padding: '1.6rem',
    width: '100%',
    gap: '1.6rem',

    '.amount-input': {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: 'fit-content',
      borderRadius: '4px',
      border: '1px solid #B8BBBF',
      padding: '0.9rem 1.2rem 1rem',
    },
  };
});

export const AmountInput = styled(TextField)(() => {
  return {
    padding: '0',
    width: '100%',
    '& .MuiOutlinedInput-root': {
      fontSize: '1.6rem',
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
  };
});

const BalanceContainer = styled(Stack)(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.4rem',
    p: {
      fontSize: '1.4rem',
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

const SSelect = styled(Select)(() => {
  return {
    width: '100%',
    maxWidth: '32.8rem',
    margin: '0 auto',
    '& .MuiSelect-select': {
      fontWeight: 500,
    },
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
