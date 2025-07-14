'use client';

import { ChangeEvent, FocusEventHandler, useCallback, useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { Box, Button, CircularProgress, FormControl, SelectChangeEvent, Stack, styled, TextField } from '@mui/material';
import { Address, formatUnits, getAddress, isAddress, parseUnits } from 'viem';
import { CoinIcon, ImageContainer, InputContainer, ModalContainer, ModalTitle } from '~/containers/Modals/Deposit';
import {
  useChainContext,
  useExternalServices,
  useAccountContext,
  useModal,
  usePoolAccountsContext,
  useNotifications,
  useRequestQuote,
} from '~/hooks';
import { ModalType } from '~/types';
import { getUsdBalance, relayerClient } from '~/utils';
import { LinksSection } from '../LinksSection';
import { AmountInputSection } from './AmountInputSection';
import { PoolAccountSelectorSection } from './PoolAccountSelectorSection';
import { RelayerSelectorSection } from './RelayerSelectorSection';

const BPS_DIVISOR = 10000n;

const minWithdrawCache = new Map<string, string>();

export const WithdrawForm = () => {
  const { setModalOpen } = useModal();
  const { addNotification } = useNotifications();

  const {
    balanceBN: { symbol, decimals: balanceDecimals },
    selectedPoolInfo,
    chainId,
    selectedRelayer,
    setSelectedRelayer,
    relayersData,
    price: currentPrice,
  } = useChainContext();

  const { relayerData } = useExternalServices();
  const { getQuote, isQuoteLoading: originalIsLoading, quoteError: originalQuoteError } = relayerData;
  const { amount, setAmount, target, setTarget, poolAccount, setPoolAccount, setFeeCommitment, setFeeBPSForWithdraw } =
    usePoolAccountsContext();
  const { poolAccounts } = useAccountContext();

  const decimals = selectedPoolInfo?.assetDecimals ?? balanceDecimals ?? 18;
  const filteredPoolAccounts = poolAccounts.filter((pa) => pa.balance > 0n);

  // New state for minimum withdrawal amount and warning
  const [minWithdrawAmount, setMinWithdrawAmount] = useState<bigint | null>(null);
  const [isLoadingMinAmount, setIsLoadingMinAmount] = useState(false);
  const [targetAddressHasError, setTargetAddressHasError] = useState(false);

  const balanceFormatted = formatUnits(poolAccount?.balance ?? BigInt(0), decimals);
  const balanceUSD = getUsdBalance(currentPrice, balanceFormatted, decimals);

  const amountBN = useMemo(() => {
    try {
      return parseUnits(amount, decimals);
    } catch {
      return 0n;
    }
  }, [amount, decimals]);

  // Cache key for minimum withdrawal amount
  const cacheKey = useMemo(() => {
    return `${chainId}-${selectedPoolInfo?.assetAddress}-${selectedRelayer?.url}`;
  }, [chainId, selectedPoolInfo?.assetAddress, selectedRelayer?.url]);

  // Calculate remaining balance after withdrawal
  const remainingBalance = useMemo(() => {
    if (!poolAccount?.balance || amountBN <= 0n) return null;
    return poolAccount.balance - amountBN;
  }, [poolAccount?.balance, amountBN]);

  // Check if withdrawal would leave insufficient remaining balance
  const shouldShowMinAmountWarning = useMemo(() => {
    if (!minWithdrawAmount || !remainingBalance || remainingBalance <= 0n) return false;
    return remainingBalance > 0n && remainingBalance < minWithdrawAmount;
  }, [minWithdrawAmount, remainingBalance]);

  // Format minimum withdrawal amount for display
  const minWithdrawFormatted = useMemo(() => {
    if (!minWithdrawAmount) return '';
    return formatUnits(minWithdrawAmount, decimals);
  }, [minWithdrawAmount, decimals]);

  const remainingBalanceFormatted = useMemo(() => {
    if (!remainingBalance) return '';
    return formatUnits(remainingBalance, decimals);
  }, [remainingBalance, decimals]);

  // Fetch minimum withdrawal amount
  const fetchMinWithdrawAmount = useCallback(async () => {
    if (!selectedPoolInfo?.assetAddress || !selectedRelayer?.url) return;

    // Check cache first
    const cachedValue = minWithdrawCache.get(cacheKey);
    if (cachedValue) {
      setMinWithdrawAmount(BigInt(cachedValue));
      return;
    }

    setIsLoadingMinAmount(true);
    try {
      const response = await relayerClient.fetchFees(selectedRelayer.url, chainId, selectedPoolInfo.assetAddress);

      const minAmount = BigInt(response.minWithdrawAmount);
      setMinWithdrawAmount(minAmount);

      // Cache the value
      minWithdrawCache.set(cacheKey, response.minWithdrawAmount);
    } catch (error) {
      console.error('Failed to fetch minimum withdrawal amount:', error);
      addNotification('error', 'Failed to fetch minimum withdrawal requirements');
    } finally {
      setIsLoadingMinAmount(false);
    }
  }, [selectedPoolInfo?.assetAddress, selectedRelayer?.url, chainId, cacheKey, addNotification]);

  // Fetch min amount when user starts entering amount or clicks max
  useEffect(() => {
    if (amount && !minWithdrawAmount && !isLoadingMinAmount) {
      fetchMinWithdrawAmount();
    }
  }, [amount, fetchMinWithdrawAmount, minWithdrawAmount, isLoadingMinAmount]);

  const isValidAmount = useMemo(() => {
    return amountBN > 0n && amountBN <= (poolAccount?.balance ?? 0n);
  }, [amountBN, poolAccount?.balance]);

  const isRecipientAddressValid = useMemo(() => {
    return target !== '' && isAddress(target) && !targetAddressHasError;
  }, [target, targetAddressHasError]);

  const isFormValid = useMemo(() => {
    return isValidAmount && isRecipientAddressValid && !!selectedRelayer?.url && !!selectedPoolInfo?.assetAddress;
  }, [isValidAmount, isRecipientAddressValid, selectedRelayer, selectedPoolInfo?.assetAddress]);

  const { quoteCommitment, feeBPS, isQuoteValid, countdown, isQuoteLoading, quoteError } = useRequestQuote({
    getQuote,
    isQuoteLoading: originalIsLoading,
    quoteError: originalQuoteError,
    chainId,
    amountBN,
    assetAddress: selectedPoolInfo?.assetAddress,
    recipient: target,
    isValidAmount,
    isRecipientAddressValid,
    isRelayerSelected: !!selectedRelayer?.url,
    addNotification,
  });

  const feeText = useMemo(() => {
    if (isQuoteLoading && !feeBPS) {
      return 'Fetching fee quote...';
    }
    if (quoteError && !feeBPS) {
      return 'Error fetching fee';
    }
    if (feeBPS === null) {
      return '';
    }

    const feeFromQuote = (BigInt(feeBPS) * amountBN) / BPS_DIVISOR;
    const formatted = formatUnits(feeFromQuote, decimals);
    const usd = getUsdBalance(currentPrice, formatted, decimals);
    const text = `Fee ${formatted} ${symbol} ~ ${usd} USD`;
    return text;
  }, [isQuoteLoading, quoteError, feeBPS, amountBN, decimals, currentPrice, symbol]);

  const isWithdrawDisabled = useMemo(() => {
    return !isFormValid || !isQuoteValid || isQuoteLoading;
  }, [isFormValid, isQuoteValid, isQuoteLoading]);

  const errorMessage = useMemo(() => {
    if (amount && amountBN <= 0n) return 'Withdrawal amount must be greater than 0';
    if (amount && !isValidAmount && amountBN > (poolAccount?.balance ?? 0n))
      return `Maximum withdraw amount is ${formatUnits(poolAccount?.balance ?? 0n, decimals)} ${symbol}`;

    // Show minimum withdrawal warning
    if (shouldShowMinAmountWarning && minWithdrawFormatted) {
      return (
        <>
          Warning: After withdrawal, remaining balance (${remainingBalanceFormatted} ${symbol}) will be below minimum
          withdrawal amount (${minWithdrawFormatted} ${symbol}). You can either:
          <ul>
            <li>Withdraw less</li>
            <li>Use &quot;Max&quot; to withdraw all</li>
            <li>Proceed and exit the rest later to your original deposit address (compromises privacy)</li>
          </ul>
        </>
      );
    }

    return '';
  }, [
    amount,
    amountBN,
    isValidAmount,
    poolAccount?.balance,
    symbol,
    decimals,
    shouldShowMinAmountWarning,
    minWithdrawFormatted,
    remainingBalanceFormatted,
  ]);

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value
      .replace(/[^0-9.]+/g, '')
      .replace(/(\..*)\..*/g, '$1')
      .slice(0, 20);

    setAmount(newAmount);

    // Fetch min amount when user starts typing
    if (newAmount && !minWithdrawAmount && !isLoadingMinAmount) {
      fetchMinWithdrawAmount();
    }
  };

  const handlePoolAccountChange = (e: SelectChangeEvent<unknown>) => {
    const selectedAccount = filteredPoolAccounts.find((pa) => pa.name.toString() === e.target.value);
    if (selectedAccount) {
      setPoolAccount(selectedAccount);
      setAmount('');
    }
  };

  const handleTargetAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTarget(e.target.value as Address);
    if (targetAddressHasError) {
      setTargetAddressHasError(false);
    }
  };

  const handleTargetAddressBlur: FocusEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    if (!value) {
      setTargetAddressHasError(false);
      return;
    }
    try {
      getAddress(value);
      setTargetAddressHasError(false);
    } catch {
      setTargetAddressHasError(true);
    }
  };

  const handleRelayerChange = (e: SelectChangeEvent<unknown>) => {
    const newRelayerUrl = e.target.value as string;
    const newRelayer = relayersData.find((r) => r.url === newRelayerUrl);
    setSelectedRelayer(newRelayer ? { name: newRelayer.name, url: newRelayer.url } : undefined);
  };

  const handleUseMax = useCallback(() => {
    if (poolAccount?.balance) {
      setAmount(formatUnits(poolAccount.balance, decimals));
    }
  }, [poolAccount, setAmount, decimals]);

  const handleWithdraw = useCallback(() => {
    console.log('🚀 handleWithdraw called with:', {
      quoteCommitment,
      countdown,
      feeBPS,
      isQuoteValid,
      hasCommitment: !!quoteCommitment,
      countdownValid: countdown > 0,
    });

    if (quoteCommitment && countdown > 0) {
      console.log('✅ Proceeding with withdrawal - quote is valid');
      setFeeCommitment(quoteCommitment);
      setFeeBPSForWithdraw(feeBPS ? BigInt(feeBPS) : BigInt(0));
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    } else {
      console.log('❌ Cannot proceed - quote invalid or expired');
      addNotification('error', 'Cannot proceed: relayer quote is invalid or expired.');
    }
  }, [
    quoteCommitment,
    countdown,
    setFeeCommitment,
    setModalOpen,
    addNotification,
    feeBPS,
    setFeeBPSForWithdraw,
    isQuoteValid,
  ]);

  const assetIcon = useMemo(() => {
    if (selectedPoolInfo?.asset === 'ETH') {
      return <CoinIcon />;
    }

    if (selectedPoolInfo?.icon) {
      return (
        <ImageContainer>
          <Image src={selectedPoolInfo.icon} alt={symbol} width={54} height={34} />
        </ImageContainer>
      );
    }

    return (
      <ImageContainer>
        <span style={{ width: '5.4rem', height: '5.4rem', backgroundColor: 'transparent' }}></span>
      </ImageContainer>
    );
  }, [selectedPoolInfo?.asset, selectedPoolInfo?.icon, symbol]);

  return (
    <ModalContainer>
      <ModalTitle variant='h2'>Make a withdraw</ModalTitle>

      <DecorativeCircle />

      <InputContainer>
        <AmountInputSection
          amount={amount}
          errorMessage={errorMessage}
          handleAmountChange={handleAmountChange}
          handleUseMax={handleUseMax}
          balanceFormatted={balanceFormatted}
          symbol={symbol}
          poolAccountName={poolAccount?.name?.toString()}
          balanceUSD={balanceUSD}
          chainIcon={assetIcon}
        />
      </InputContainer>

      <Stack gap={2} width='100%' maxWidth='32.8rem' zIndex='1'>
        <FormControl fullWidth>
          <TextField
            id='target-address'
            placeholder='Target Address'
            value={target}
            error={targetAddressHasError || (target !== '' && !isAddress(target))}
            onChange={handleTargetAddressChange}
            onBlur={handleTargetAddressBlur}
            helperText={targetAddressHasError || (target !== '' && !isAddress(target)) ? 'Invalid address' : ''}
            data-testid='target-address-input'
          />
        </FormControl>

        <PoolAccountSelectorSection
          poolAccountName={poolAccount?.name?.toString()}
          handlePoolAccountChange={handlePoolAccountChange}
          filteredPoolAccounts={filteredPoolAccounts}
          decimals={decimals}
          symbol={symbol}
        />

        <RelayerSelectorSection
          selectedRelayer={selectedRelayer}
          relayersData={relayersData}
          handleRelayerChange={handleRelayerChange}
          isQuoteLoading={isQuoteLoading}
          quoteError={quoteError}
          feeText={feeText}
          isQuoteValid={isQuoteValid}
          countdown={countdown}
        />
      </Stack>

      <Button
        disabled={isWithdrawDisabled}
        onClick={handleWithdraw}
        data-testid='confirm-withdrawal-button'
        sx={{ zIndex: 2 }}
        startIcon={isQuoteLoading || isLoadingMinAmount ? <CircularProgress size={16} color='inherit' /> : null}
      >
        {(isQuoteLoading || isLoadingMinAmount) && 'Getting Quote...'}
        {!isQuoteLoading && !isLoadingMinAmount && 'Withdraw'}
      </Button>

      <LinksSection />
    </ModalContainer>
  );
};

const DecorativeCircle = styled(Box)(() => {
  return {
    width: '647px',
    height: '646px',
    position: 'absolute',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: '1px solid #D9D9D9',
    zIndex: 0,
    top: '84%',
  };
});
// (moved above)
