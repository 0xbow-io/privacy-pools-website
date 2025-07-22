'use client';
import { useEffect, useState } from 'react';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Stack, styled, Typography, IconButton, Collapse } from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';
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
import { FeeBreakdown } from './FeeBreakdown';

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
  const {
    balanceBN: { symbol, decimals },
    price,
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
  } = usePoolAccountsContext();
  const { addNotification } = useNotifications();
  const isDeposit = actionType === EventType.DEPOSIT;
  const isStableAsset = selectedPoolInfo?.isStableAsset ?? false;

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
    quoteCommitment,
  } = useRequestQuote({
    getQuote: getQuote || (() => Promise.reject(new Error('No relayer data'))),
    isQuoteLoading: isQuoteLoading || false,
    quoteError: quoteError || null,
    chainId,
    amountBN,
    assetAddress: selectedPoolInfo?.assetAddress,
    recipient: target,
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
  const feesCollector = `OxBow (${truncateAddress(feesCollectorAddress)})`;

  const amountUSD = getUsdBalance(price, amount, decimals);

  // Value is now the actual amount being withdrawn (amount minus fees)
  const amountWithFeeBN = parseUnits(amount, decimals) - fees;
  const amountWithFee = formatUnits(amountWithFeeBN, decimals);
  const amountWithFeeUSD = getUsdBalance(price, amountWithFee, decimals);
  const valueText = `${parseFloat(amountWithFee).toString()} ${symbol} (~$${parseFloat(amountWithFeeUSD.replace('$', '')).toFixed(2)} USD)`;
  const valueTooltip = `${formatFullPrecision(amountWithFeeBN, decimals)} ${symbol}`;

  // Net Fee calculation (includes extra gas amount if enabled)
  let netFeeAmount = fees;
  if (quoteState.extraGas && quoteExtraGasAmountETH) {
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

  const netFeeText = `${netFeeDisplayValue} ${symbol} (~$${parseFloat(netFeeUSD.replace('$', '')).toFixed(2)} USD)`;
  const netFeeTooltip = `${formatFullPrecision(netFeeAmount, decimals)} ${symbol}`;

  const totalAmountBN = parseUnits(amount, decimals);
  const totalTooltip = `${formatFullPrecision(totalAmountBN, decimals)} ${symbol}`;

  return (
    <Container>
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
          <Value variant='body2'>
            <Tooltip title={toAddress} placement='top'>
              <span>
                {toAddress && truncateAddress(toAddress)}
                {!toAddress && 'New Pool Account'}
              </span>
            </Tooltip>
          </Value>
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
                {amount} {symbol}
              </TotalAmount>
            </Tooltip>
            <TotalUSD>${parseFloat(amountUSD.replace('$', '')).toFixed(2)}</TotalUSD>
          </TotalBox>

          <TotalBox>
            <TotalLabel>Total Received</TotalLabel>
            <Tooltip title={valueTooltip} placement='top'>
              <TotalAmount>
                {parseFloat(amountWithFee).toFixed(3)} {symbol}
              </TotalAmount>
            </Tooltip>
            <TotalUSD>${parseFloat(amountWithFeeUSD.replace('$', '')).toFixed(2)}</TotalUSD>
          </TotalBox>
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

const TotalsContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  marginTop: '24px',
  justifyContent: 'space-between',
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    left: '50%',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: theme.palette.divider,
    transform: 'translateX(-50%)',
  },
}));

const TotalBox = styled('div')(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0 0 16px',
  gap: '4px',
  backgroundColor: 'transparent',
  minWidth: '208px',
  height: '86px',
}));

const TotalLabel = styled(Typography)(({ theme }) => ({
  fontFamily: 'IBM Plex Mono',
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '18px',
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));

const TotalAmount = styled(Typography)(({ theme }) => ({
  fontFamily: 'IBM Plex Mono',
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '26px',
  color: theme.palette.text.primary,
  textAlign: 'center',
  cursor: 'help',
}));

const TotalUSD = styled(Typography)(({ theme }) => ({
  fontFamily: 'IBM Plex Mono',
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '18px',
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));
