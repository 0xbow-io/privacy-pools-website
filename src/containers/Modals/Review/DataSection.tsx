'use client';
import { useEffect, useState } from 'react';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Stack, styled, Typography, IconButton, Collapse, Avatar, Alert, Button } from '@mui/material';
import { formatUnits, parseUnits, isAddress } from 'viem';
import { useAccount, useEnsName, useEnsAvatar, usePublicClient } from 'wagmi';
import { ExtendedTooltip as Tooltip } from '~/components';
import { useQuoteContext } from '~/contexts/QuoteContext';
import {
  useExternalServices,
  usePoolAccountsContext,
  useChainContext,
  useRequestQuote,
  useNotifications,
} from '~/hooks';
import { EventType } from '~/types';
import { getUsdBalance, truncateAddress } from '~/utils';
import { getStakedTokenPreview } from '~/utils/alternativeTokenDeposit';
import { FeeBreakdown, formatFeeDisplay } from './FeeBreakdown';

const getMaxDisplayPrecision = (isStableAsset: boolean): number => {
  // Stable assets (stablecoins and yield-bearing stablecoins) should have max 3 decimal places
  if (isStableAsset) {
    return 3;
  }
  // ETH and other tokens can show full precision (use high number)
  return 18;
};

export const DataSection = () => {
  const { address } = useAccount();
  const [isFeeBreakdownOpen, setIsFeeBreakdownOpen] = useState(false);
  const { quoteState } = useQuoteContext();
  const publicClient = usePublicClient();
  const {
    balanceBN: { symbol, decimals },
    price,
    refetchPrice,
    selectedPoolInfo,
    chainId,
  } = useChainContext();
  const { currentSelectedRelayerData, relayerData } = useExternalServices();
  const {
    amount,
    target,
    actionType,
    poolAccount,
    vettingFeeBPS,
    feeBPSForWithdraw,
    setFeeCommitment,
    setFeeBPSForWithdraw,
    selectedAlternativeToken,
  } = usePoolAccountsContext();
  const { addNotification } = useNotifications();
  const isDeposit = actionType === EventType.DEPOSIT;
  const isStableAsset = selectedPoolInfo?.isStableAsset ?? false;

  // Calculate sUSDS amount if using alternative token
  const [sUSDSPreview, setSUSDSPreview] = useState<bigint | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      if (isDeposit && selectedAlternativeToken && publicClient && amount) {
        try {
          const amountBN = parseUnits(amount, decimals);
          const preview = await getStakedTokenPreview(selectedAlternativeToken, amountBN, publicClient);
          setSUSDSPreview(preview);
        } catch (error) {
          console.error('Error fetching sUSDS preview:', error);
        }
      } else {
        setSUSDSPreview(null);
      }
    };
    fetchPreview();
  }, [isDeposit, selectedAlternativeToken, amount, decimals, publicClient]);

  // Add quote timer for withdrawals
  const amountBN = parseUnits(amount, decimals);
  const { getQuote, isQuoteLoading, quoteError } = relayerData || {};
  const {
    countdown,
    isQuoteValid,
    isExpired,
    feeBPS: quoteFeesBPS,
    baseFeeBPS: quoteBaseFeeBPS,
    extraGasAmountETH: quoteExtraGasAmountETH,
    relayTxCostETH: quoteRelayTxCostETH,
    quoteCommitment,
  } = useRequestQuote({
    getQuote: getQuote || (() => Promise.reject(new Error('No relayer data'))),
    isQuoteLoading: isQuoteLoading || false,
    quoteError: quoteError || null,
    chainId,
    amountBN,
    assetAddress: selectedPoolInfo?.assetAddress,
    recipient: target,
    relayerUrl: currentSelectedRelayerData?.url,
    isValidAmount: amountBN > 0n,
    isRecipientAddressValid: !!target,
    isRelayerSelected: !!currentSelectedRelayerData?.relayerAddress,
    addNotification,
  });

  // Set fee commitment when valid quote is available for withdrawals
  useEffect(() => {
    if (actionType === EventType.WITHDRAWAL && isQuoteValid && quoteCommitment && quoteFeesBPS) {
      setFeeCommitment(quoteCommitment);
      setFeeBPSForWithdraw(BigInt(quoteFeesBPS));
    }
  }, [actionType, isQuoteValid, quoteCommitment, quoteFeesBPS, setFeeCommitment, setFeeBPSForWithdraw]);
  const aspDataFees = (vettingFeeBPS * parseUnits(amount, decimals)) / 100n / 100n;
  const aspOrRelayer = {
    label: isDeposit ? 'ASP' : 'Relayer',
    value: isDeposit ? '0xBow ASP' : currentSelectedRelayerData?.name,
  };

  const fromAddress = isDeposit ? address : '';
  const toAddress = isDeposit ? '' : target;

  // ENS hooks for the target address
  const { data: ensName } = useEnsName({
    address: isAddress(toAddress) ? (toAddress as `0x${string}`) : undefined,
    chainId: 1, // Always use mainnet for ENS
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName || undefined,
    chainId: 1, // Always use mainnet for ENS
  });

  // Use fresh quote fees for withdrawals, fallback to context fees if no quote
  const effectiveFeeBPS = isDeposit ? feeBPSForWithdraw : (quoteFeesBPS ?? feeBPSForWithdraw ?? 0);
  const relayerFees = (BigInt(effectiveFeeBPS) * parseUnits(amount, decimals)) / 100n / 100n;

  const fees = isDeposit ? aspDataFees : relayerFees;

  // Create full precision tooltips - show complete decimal precision
  const formatFullPrecision = (value: bigint, decimals: number) => {
    const valueStr = value.toString();
    if (valueStr.length <= decimals) {
      return `0.${'0'.repeat(decimals - valueStr.length)}${valueStr}`;
    }
    const integerPart = valueStr.slice(0, -decimals);
    const decimalPart = valueStr.slice(-decimals);
    const result = `${integerPart}.${decimalPart}`;

    // Remove trailing zeros, but keep at least 2 decimal places
    const trimmed = result.replace(/\.?0+$/, '');
    if (!trimmed.includes('.')) {
      return `${trimmed}.00`;
    }
    const decimalIndex = trimmed.indexOf('.');
    const currentDecimals = trimmed.length - decimalIndex - 1;
    if (currentDecimals < 2) {
      return trimmed + '0'.repeat(2 - currentDecimals);
    }

    return trimmed;
  };

  const feesCollectorAddress = isDeposit
    ? selectedPoolInfo.entryPointAddress
    : currentSelectedRelayerData?.relayerAddress;
  const feesCollectorName = isDeposit ? '0xBow' : currentSelectedRelayerData?.name || 'Relayer';
  const feesCollector = `${feesCollectorName} (${truncateAddress(feesCollectorAddress)})`;

  // Use alternative token symbol if selected
  const displaySymbol = selectedAlternativeToken && isDeposit ? selectedAlternativeToken.tokenSymbol : symbol;

  const amountUSD = getUsdBalance(price, amount, decimals);

  // Value is now the actual amount being withdrawn (amount minus fees)
  const amountWithFeeBN = parseUnits(amount, decimals) - fees;
  const amountWithFee = formatUnits(amountWithFeeBN, decimals);
  const amountWithFeeUSD = getUsdBalance(price, amountWithFee, decimals);
  const valueText = price
    ? `${parseFloat(amountWithFee).toString()} ${displaySymbol} (~$${parseFloat(amountWithFeeUSD.replace('$', '')).toFixed(2)} USD)`
    : `${parseFloat(amountWithFee).toString()} ${displaySymbol}`;
  const valueTooltip = `${formatFullPrecision(amountWithFeeBN, decimals)} ${displaySymbol}`;

  // Net Fee calculation (includes extra gas amount if enabled)
  let netFeeAmount = fees;
  if (quoteState.extraGas && quoteExtraGasAmountETH && price) {
    // Convert extraGasAmountETH from wei to token amount
    const extraGasETH = parseFloat(formatUnits(BigInt(quoteExtraGasAmountETH), 18));
    const extraGasInToken = (extraGasETH * price) / parseFloat(formatUnits(parseUnits('1', decimals), decimals));

    // Convert to fixed decimal string to avoid scientific notation
    const extraGasAmountBN = parseUnits(extraGasInToken.toFixed(decimals), decimals);
    netFeeAmount = fees + extraGasAmountBN;
  }
  const netFeeFormatted = formatUnits(netFeeAmount, decimals);
  const netFeeUSD = getUsdBalance(price, netFeeFormatted, decimals);

  // Net fee uses the same precision logic as fee breakdown
  const netFeePrecision = getMaxDisplayPrecision(isStableAsset);
  const netFeeNumeric = parseFloat(netFeeFormatted);
  const netFeeDisplayValue = parseFloat(netFeeNumeric.toFixed(netFeePrecision)).toString();

  const netFeeText = price
    ? `${netFeeDisplayValue} ${displaySymbol} (~$${parseFloat(netFeeUSD.replace('$', '')).toFixed(2)} USD)`
    : `${netFeeDisplayValue} ${displaySymbol}`;
  const netFeeTooltip = `${formatFullPrecision(netFeeAmount, decimals)} ${displaySymbol}`;

  const totalAmountBN = parseUnits(amount, decimals);
  const totalTooltip = `${formatFullPrecision(totalAmountBN, decimals)} ${displaySymbol}`;

  return (
    <Container>
      {selectedAlternativeToken && isDeposit && (
        <Alert severity='info' sx={{ mb: 2, fontSize: '1.4rem' }}>
          <Stack gap={1}>
            <Typography variant='body2'>
              <strong>Staking Flow:</strong> Your {selectedAlternativeToken.tokenSymbol} will be staked to{' '}
              {selectedPoolInfo?.asset}
            </Typography>
            {sUSDSPreview && (
              <Typography variant='body2'>
                <strong>You will receive:</strong> {formatUnits(sUSDSPreview, decimals)} {selectedPoolInfo?.asset}
              </Typography>
            )}
            <Typography variant='caption' color='text.secondary'>
              This will be done in a single batched transaction
            </Typography>
          </Stack>
        </Alert>
      )}

      <Stack>
        {actionType !== EventType.EXIT && (
          <Row>
            <Label variant='body2'>{aspOrRelayer.label}:</Label>
            <Value variant='body2'>{aspOrRelayer.value}</Value>
          </Row>
        )}

        <Row>
          <Label variant='body2'>From:</Label>
          <Value variant='body2'>
            <Tooltip title={fromAddress} placement='top'>
              <span>
                {fromAddress && truncateAddress(fromAddress)}
                {!fromAddress && `PA-${poolAccount?.name}`}
              </span>
            </Tooltip>
          </Value>
        </Row>

        <Row>
          <Label variant='body2'>To:</Label>
          <AddressValue>
            {ensAvatar && <Avatar src={ensAvatar} sx={{ width: 20, height: 20 }} />}
            <Tooltip title={toAddress} placement='top'>
              <span>
                {toAddress && (ensName || truncateAddress(toAddress))}
                {!toAddress && 'New Pool Account'}
              </span>
            </Tooltip>
          </AddressValue>
        </Row>
      </Stack>
      {actionType !== EventType.EXIT && (
        <Stack>
          <Row>
            <Label variant='body2'>Fees Collector:</Label>
            <Tooltip title={feesCollectorAddress} placement='top'>
              <Value variant='body2'>{feesCollector}</Value>
            </Tooltip>
          </Row>
          {actionType === EventType.WITHDRAWAL && (isQuoteValid || isExpired) && (
            <Row>
              <Label variant='body2'>Quote expires:</Label>
              {countdown > 0 ? (
                <QuoteTimer variant='body2'>in {countdown}s</QuoteTimer>
              ) : (
                <FlashingExpiredTimer variant='body2'>Expired</FlashingExpiredTimer>
              )}
            </Row>
          )}
          {actionType !== EventType.WITHDRAWAL && (isQuoteValid || isExpired) && (
            <Row>
              <Label variant='body2'>Value:</Label>
              <Tooltip title={valueTooltip} placement='top'>
                <Value variant='body2'>{valueText}</Value>
              </Tooltip>
            </Row>
          )}
          {/* Net Fee row with dropdown for withdrawals */}
          {actionType === EventType.WITHDRAWAL && isQuoteValid && quoteFeesBPS !== null && quoteBaseFeeBPS !== null && (
            <>
              <Row>
                <Label variant='body2'>Net Fee:</Label>
                <FeeRow>
                  <Tooltip title={netFeeTooltip} placement='top'>
                    <NetFeeValue isExtraGasEnabled={quoteState.extraGas} variant='body2'>
                      {netFeeText}
                    </NetFeeValue>
                  </Tooltip>
                  <ExpandIconButton
                    onClick={() => setIsFeeBreakdownOpen(!isFeeBreakdownOpen)}
                    expanded={isFeeBreakdownOpen}
                  >
                    <ExpandMoreIcon />
                  </ExpandIconButton>
                </FeeRow>
              </Row>

              {/* Collapsible Fee Breakdown */}
              <Collapse in={isFeeBreakdownOpen}>
                <FeeBreakdownContainer>
                  <FeeBreakdown
                    feeBPS={quoteFeesBPS}
                    baseFeeBPS={quoteBaseFeeBPS}
                    extraGasAmountETH={quoteState.extraGas ? quoteExtraGasAmountETH : null}
                    relayTxCostETH={quoteRelayTxCostETH}
                    amount={amount}
                  />
                </FeeBreakdownContainer>
              </Collapse>
            </>
          )}
        </Stack>
      )}

      {/* Totals Section for Withdrawals */}
      {actionType === EventType.WITHDRAWAL && (
        <TotalsContainer>
          <TotalBox>
            <TotalLabel>Total Withdrawn</TotalLabel>
            <Tooltip title={totalTooltip} placement='top'>
              <TotalAmount>
                {formatFeeDisplay(totalAmountBN, symbol, decimals, price, isStableAsset).displayText.split(' (~')[0]}
              </TotalAmount>
            </Tooltip>
            {price && <TotalUSD>${parseFloat(amountUSD.replace('$', '')).toFixed(2)}</TotalUSD>}
          </TotalBox>

          <TotalBox>
            <TotalLabel>Total Received</TotalLabel>
            <Tooltip title={valueTooltip} placement='top'>
              <TotalAmount>
                {formatFeeDisplay(amountWithFeeBN, symbol, decimals, price, isStableAsset).displayText.split(' (~')[0]}
              </TotalAmount>
            </Tooltip>
            {price && <TotalUSD>${parseFloat(amountWithFeeUSD.replace('$', '')).toFixed(2)}</TotalUSD>}
          </TotalBox>

          {!price && (
            <RefetchPriceButton size='small' onClick={refetchPrice} startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}>
              Load price
            </RefetchPriceButton>
          )}
        </TotalsContainer>
      )}
    </Container>
  );
};

const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  fontSize: '1.6rem',
  width: '100%',
  zIndex: 1,
}));

const Row = styled(Stack)(({ theme }) => ({
  gap: 0,
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',

  '& > *:not(:last-child)': {
    marginRight: theme.spacing(1),
  },

  [theme.breakpoints.down('sm')]: {
    '& > p': {
      fontSize: theme.typography.body2.fontSize,
    },
  },
}));

const Label = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1.6rem',
  fontStyle: 'normal',
  fontWeight: 700,
  lineHeight: '150%',
}));

const Value = styled(Label)(() => ({
  fontWeight: 400,
}));

const AddressValue = styled('div')(({ theme }) => ({
  color: theme.palette.grey[500],
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  fontSize: '1.6rem',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '150%',

  [theme.breakpoints.down('sm')]: {
    fontSize: theme.typography.body2.fontSize,
  },
}));

const QuoteTimer = styled(Value)(({ theme }) => ({
  fontWeight: 500,
  color: theme.palette.warning.main,
}));

const FlashingExpiredTimer = styled(Value)(({ theme }) => ({
  fontWeight: 500,
  color: theme.palette.error.main,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  animation: 'flash 2s 3',

  '@keyframes flash': {
    '0%, 50%': {
      opacity: 1,
    },
    '25%, 75%': {
      opacity: 0.3,
    },
  },
}));

const FeeRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

const NetFeeValue = styled(Value, {
  shouldForwardProp: (prop) => prop !== 'isExtraGasEnabled',
})<{ isExtraGasEnabled?: boolean }>(({ theme, isExtraGasEnabled }) => ({
  color: isExtraGasEnabled ? theme.palette.success.main : theme.palette.text.primary,
  fontWeight: isExtraGasEnabled ? 600 : 400,
}));

const ExpandIconButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'expanded',
})<{ expanded?: boolean }>(({ theme, expanded }) => ({
  padding: '2px',
  minWidth: '24px',
  minHeight: '24px',
  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
  '& .MuiSvgIcon-root': {
    fontSize: '18px',
  },
}));

const FeeBreakdownContainer = styled('div')({
  marginTop: '8px',
  marginLeft: '16px',
});

const TotalsContainer = styled('div')(() => ({
  display: 'flex',
  flexWrap: 'wrap',
  marginTop: '24px',
  justifyContent: 'space-between',
  position: 'relative',
  '& > button': {
    width: '100%',
    justifyContent: 'center',
  },
}));

const TotalBox = styled('div')(({ theme }) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0 0 16px',
  gap: '4px',
  backgroundColor: 'transparent',
  minWidth: '208px',
  height: '86px',
  '& + &': {
    borderLeft: `1px solid ${theme.palette.divider}`,
  },
}));

const TotalLabel = styled(Typography)(({ theme }) => ({
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '18px',
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));

const TotalAmount = styled(Typography)(({ theme }) => ({
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '26px',
  color: theme.palette.text.primary,
  textAlign: 'center',
  cursor: 'help',
}));

const TotalUSD = styled(Typography)(({ theme }) => ({
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '18px',
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));

const RefetchPriceButton = styled(Button)(({ theme }) => ({
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '16px',
  color: theme.palette.text.secondary,
  textTransform: 'none',
  padding: '2px 8px',
  minHeight: 0,
  '&:hover': {
    color: theme.palette.text.primary,
  },
  '& .MuiSvgIcon-root': {
    fontSize: '14px !important',
  },
}));
