'use client';

import { ChangeEvent, useCallback, useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  SelectChangeEvent,
  Stack,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { Address, formatUnits, isAddress, parseUnits } from 'viem';
import { useSwitchChain } from 'wagmi';
import { chainData, allPoolsChainData } from '~/config';
import { ChainTokenSelectorDropdown } from '~/containers/ChainTokenSelector';
import { ModalContainer, ModalTitle } from '~/containers/Modals/Deposit';
import { useQuoteContext } from '~/contexts/QuoteContext';
import {
  useChainContext,
  useAccountContext,
  useModal,
  usePoolAccountsContext,
  useNotifications,
  useExternalServices,
  useAuthContext,
} from '~/hooks';
import { ModalType, ReviewStatus } from '~/types';
import { countDepositsAtLeast, getUsdBalance, relayerClient } from '~/utils';
import { LinksSection } from '../LinksSection';
import { AmountInputSection } from './AmountInputSection';
import { PoolAccountSelectorSection } from './PoolAccountSelectorSection';
import { RelayerSelectorSection } from './RelayerSelectorSection';

const minWithdrawCache = new Map<string, string>();

export const WithdrawForm = () => {
  const { setModalOpen } = useModal();
  const { addNotification } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();

  const {
    balanceBN: { symbol, decimals: balanceDecimals },
    selectedPoolInfo,
    chainId,
    selectedRelayer,
    setSelectedRelayer,
    relayersData,
    price: currentPrice,
    setSelectedAsset,
    setChainId,
  } = useChainContext();

  const { amount, setAmount, target, setTarget, poolAccount, setPoolAccount, setFeeCommitment, setFeeBPSForWithdraw } =
    usePoolAccountsContext();
  const { poolAccounts } = useAccountContext();
  const {
    aspData: { depositAmountsData, isLoading: isLoadingAsp },
  } = useExternalServices();
  const { setExtraGas, requestQuote, resetQuote } = useQuoteContext();
  const { switchChainAsync } = useSwitchChain();
  const { hasWallet } = useAuthContext();

  const [tokenSelectorAnchor, setTokenSelectorAnchor] = useState<HTMLElement | null>(null);

  const decimals = selectedPoolInfo?.assetDecimals ?? balanceDecimals ?? 18;

  // Filter pool accounts by current chain, pool scope, balance > 0, and APPROVED status
  const filteredPoolAccounts = useMemo(() => {
    return poolAccounts.filter(
      (pa) =>
        pa.balance > 0n &&
        pa.chainId === chainId &&
        pa.scope === selectedPoolInfo?.scope &&
        pa.reviewStatus === ReviewStatus.APPROVED,
    );
  }, [poolAccounts, chainId, selectedPoolInfo?.scope]);

  // New state for minimum withdrawal amount and warning
  const [minWithdrawAmount, setMinWithdrawAmount] = useState<bigint | null>(null);
  const [isLoadingMinAmount, setIsLoadingMinAmount] = useState(false);
  const [targetAddressHasError, setTargetAddressHasError] = useState(false);
  const [receiveGasToken, setReceiveGasToken] = useState(false);

  // Reset state when pool changes. The anonymity set needs no reset: it is
  // derived from the entered amount and this pool's own feeds, both of which
  // are already keyed by scope.
  useEffect(() => {
    setMinWithdrawAmount(null);
  }, [selectedPoolInfo?.scope]);

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

  // Counted in the browser against the pool's published amount list, which
  // useASP loads with the other public feeds. Nothing is fetched from here.
  const anonymitySet = useMemo(
    () => countDepositsAtLeast(depositAmountsData?.amounts, amountBN),
    [amountBN, depositAmountsData?.amounts],
  );

  const isLoadingAnonymitySet = amountBN > 0n && !!isLoadingAsp;

  const isValidAmount = useMemo(() => {
    return amountBN > 0n && amountBN <= (poolAccount?.balance ?? 0n);
  }, [amountBN, poolAccount?.balance]);

  const isRecipientAddressValid = useMemo(() => {
    return target !== '' && isAddress(target) && !targetAddressHasError;
  }, [target, targetAddressHasError]);

  const hasApprovedAccounts = filteredPoolAccounts.length > 0;

  const isFormValid = useMemo(() => {
    return (
      hasApprovedAccounts &&
      isValidAmount &&
      isRecipientAddressValid &&
      !!selectedRelayer?.url &&
      !!selectedPoolInfo?.assetAddress
    );
  }, [hasApprovedAccounts, isValidAmount, isRecipientAddressValid, selectedRelayer, selectedPoolInfo?.assetAddress]);

  // Quote handling moved to Review screen

  const feeText = 'Fee will be calculated on review screen';

  const isWithdrawDisabled = useMemo(() => {
    return !isFormValid;
  }, [isFormValid]);

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
    const value = e.target.value;
    setTarget(value as Address);
    setTargetAddressHasError(value !== '' && !isAddress(value));
  };

  const handleRelayerChange = (e: SelectChangeEvent<unknown>) => {
    const newRelayerUrl = e.target.value as string;
    const newRelayer = relayersData.find((r) => r.url === newRelayerUrl);
    if (newRelayerUrl !== selectedRelayer?.url) {
      resetQuote();
      setFeeCommitment(null);
      setFeeBPSForWithdraw(0n);
    }
    setSelectedRelayer(newRelayer ? { name: newRelayer.name, url: newRelayer.url } : undefined);
  };

  // Handle chain+token selection from dropdown
  const handleChainTokenSelect = async (selectedChainId: number, selectedAsset: string) => {
    // Find the selected pool from allPoolsChainData
    const targetChainData = allPoolsChainData[selectedChainId];
    if (!targetChainData) return;

    const selectedPool = targetChainData.poolInfo.find((p) => p.asset.toLowerCase() === selectedAsset.toLowerCase());

    if (selectedPool) {
      // If selecting a pool from a different chain, move the wallet with it when there is one.
      // A withdrawal is relayed, so a seed-only session just changes the app's chain.
      if (selectedChainId !== chainId) {
        if (hasWallet) {
          try {
            addNotification('info', `Switching to ${targetChainData.name}...`);
            await switchChainAsync({ chainId: selectedChainId });
            // Update the app's chain context to match the wallet's chain
            setChainId(selectedChainId);
            addNotification('success', `Switched to ${targetChainData.name}`);
          } catch (err) {
            console.error('Failed to switch chain:', err);
            addNotification('error', `Please switch to ${targetChainData.name} to withdraw from this pool`);
            return; // Don't proceed with asset selection if chain switch failed
          }
        } else {
          setChainId(selectedChainId);
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

    // Reset amount and pool account
    setAmount('');
    setPoolAccount(undefined);
  };

  const handleUseMax = useCallback(() => {
    if (poolAccount?.balance) {
      setAmount(formatUnits(poolAccount.balance, decimals));
    }
  }, [poolAccount, setAmount, decimals]);

  const handleWithdraw = useCallback(() => {
    // Set extraGas based on checkbox state
    setExtraGas(receiveGasToken);
    // Signal that the price should be requested when Review screen opens.
    // The recipient goes to the relayer only on Confirm, with the commitment request.
    requestQuote();
    // Go to Review screen
    setModalOpen(ModalType.REVIEW);
  }, [setModalOpen, setExtraGas, receiveGasToken, requestQuote]);

  return (
    <ModalContainer>
      <ModalTitle variant='h2'>Withdraw</ModalTitle>

      <DecorativeCircle />

      <Stack gap={2} width='100%' maxWidth='47rem' zIndex='1'>
        {/* Pool Selector */}
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

        {hasApprovedAccounts ? (
          <PoolAccountSelectorSection
            poolAccountName={poolAccount?.name?.toString()}
            handlePoolAccountChange={handlePoolAccountChange}
            filteredPoolAccounts={filteredPoolAccounts}
            decimals={decimals}
            symbol={symbol}
          />
        ) : (
          <Typography variant='body2' color='error' sx={{ textAlign: 'center', py: 1 }}>
            {poolAccounts.some(
              (pa) =>
                pa.chainId === chainId &&
                pa.scope === selectedPoolInfo.scope &&
                pa.reviewStatus === ReviewStatus.UNAVAILABLE,
            )
              ? 'Approval status unavailable. Please try again later.'
              : 'No approved deposits available for withdrawal in this pool. Please wait for your deposits to be approved.'}
          </Typography>
        )}

        <FormControl fullWidth>
          <Box sx={{ position: 'relative' }}>
            <TextField
              id='target-address'
              placeholder='Target Address'
              value={target}
              error={targetAddressHasError}
              onChange={handleTargetAddressChange}
              spellCheck={false}
              helperText={targetAddressHasError ? 'Invalid address' : ''}
              data-testid='target-address-input'
              fullWidth
            />
          </Box>
        </FormControl>

        <AmountInputSection
          amount={amount}
          errorMessage={errorMessage}
          handleAmountChange={handleAmountChange}
          handleUseMax={handleUseMax}
          balanceFormatted={balanceFormatted}
          symbol={symbol}
          poolAccountName={poolAccount?.name?.toString()}
          balanceUSD={balanceUSD}
          currentPrice={currentPrice}
          anonymitySet={anonymitySet}
          isLoadingAnonymitySet={isLoadingAnonymitySet}
        />

        <RelayerSelectorSection
          selectedRelayer={selectedRelayer}
          relayersData={relayersData}
          handleRelayerChange={handleRelayerChange}
          feeText={feeText}
          isQuoteLoading={false}
          quoteError={null}
          isQuoteValid={false}
          countdown={0}
        />

        {selectedPoolInfo?.isStableAsset &&
          selectedPoolInfo?.asset !== 'frxUSD' &&
          selectedPoolInfo?.asset !== 'WOETH' && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={receiveGasToken}
                  onChange={(e) => setReceiveGasToken(e.target.checked)}
                  size='small'
                />
              }
              label='Receive some Gas Token'
              sx={{ alignSelf: 'flex-start', marginLeft: 0 }}
            />
          )}
      </Stack>

      <Button
        disabled={isWithdrawDisabled}
        onClick={handleWithdraw}
        data-testid='confirm-withdrawal-button'
        sx={{ zIndex: 2 }}
        startIcon={isLoadingMinAmount ? <CircularProgress size={16} color='inherit' /> : null}
      >
        {isLoadingMinAmount && 'Loading...'}
        {!isLoadingMinAmount && 'Review Withdrawal'}
      </Button>

      <LinksSection context='withdrawal' />
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

const TokenSelectorButton = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.grey[300]}`,
  borderRadius: '8px',
  padding: '12px 16px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
  '&:hover': {
    borderColor: theme.palette.grey[400],
  },
}));
