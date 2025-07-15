'use client';
import { useEffect } from 'react';
import { Stack, styled, Typography } from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { ExtendedTooltip as Tooltip } from '~/components';
import {
  useExternalServices,
  usePoolAccountsContext,
  useChainContext,
  useRequestQuote,
  useNotifications,
} from '~/hooks';
import { EventType } from '~/types';
import { getUsdBalance, truncateAddress } from '~/utils';

export const DataSection = () => {
  const { address } = useAccount();
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
    setProof,
  } = usePoolAccountsContext();
  const { addNotification } = useNotifications();
  const isDeposit = actionType === EventType.DEPOSIT;

  // Add quote timer for withdrawals
  const amountBN = parseUnits(amount, decimals);
  const { getQuote, isQuoteLoading, quoteError } = relayerData || {};
  const {
    countdown,
    isQuoteValid,
    isExpired,
    requestNewQuote,
    feeBPS: quoteFeesBPS,
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

  // Update PoolAccountsContext when a new quote is received (for withdrawals)
  useEffect(() => {
    if (actionType === EventType.WITHDRAWAL && quoteCommitment && quoteFeesBPS !== null) {
      console.log('📋 DataSection: Updating PoolAccountsContext with new quote:', {
        quoteCommitment,
        quoteFeesBPS,
      });
      setFeeCommitment(quoteCommitment);
      setFeeBPSForWithdraw(BigInt(quoteFeesBPS));

      // Clear existing proof since fee parameters changed - new proof needed
      console.log('🔄 DataSection: Clearing existing proof - new quote requires new proof generation');
      setProof(null);
    }
  }, [actionType, quoteCommitment, quoteFeesBPS, setFeeCommitment, setFeeBPSForWithdraw, setProof]);
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
  const feeFormatted = formatUnits(fees, decimals);
  const feeUSD = getUsdBalance(price, feeFormatted, decimals);
  const feeText = `${feeFormatted} ${symbol} (~ ${feeUSD} USD)`;

  // Create full precision tooltips - show complete decimal precision
  const formatFullPrecision = (value: bigint, decimals: number) => {
    const valueStr = value.toString();
    if (valueStr.length <= decimals) {
      return `0.${'0'.repeat(decimals - valueStr.length)}${valueStr}`;
    }
    const integerPart = valueStr.slice(0, -decimals);
    const decimalPart = valueStr.slice(-decimals);
    return `${integerPart}.${decimalPart}`;
  };

  const feeTooltip = `${formatFullPrecision(fees, decimals)} ${symbol}`;

  const feesCollectorAddress = isDeposit
    ? selectedPoolInfo.entryPointAddress
    : currentSelectedRelayerData?.relayerAddress;
  const feesCollector = `OxBow (${truncateAddress(feesCollectorAddress)})`;

  const amountUSD = getUsdBalance(price, amount, decimals);
  const amountWithFeeBN = parseUnits(amount, decimals) - fees;
  const amountWithFee = formatUnits(amountWithFeeBN, decimals);
  const amountWithFeeUSD = getUsdBalance(price, amountWithFee, decimals);

  const valueText = `${amountWithFee} ${symbol} (~ ${amountWithFeeUSD} USD)`;
  const valueTooltip = `${formatFullPrecision(amountWithFeeBN, decimals)} ${symbol}`;

  const totalText = `~${amount.slice(0, 6)} ${symbol} (~ ${amountUSD} USD)`;
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
          <Row>
            <Label variant='body2'>Fees:</Label>
            <Tooltip title={feeTooltip} placement='top'>
              <Value variant='body2'>{feeText}</Value>
            </Tooltip>
          </Row>
          {actionType === EventType.WITHDRAWAL && (
            <>
              {isQuoteValid && countdown > 0 && (
                <Row>
                  <Label variant='body2'>Quote expires:</Label>
                  <QuoteTimer variant='body2'>in {countdown}s</QuoteTimer>
                </Row>
              )}
              {isExpired && (
                <Row>
                  <Label variant='body2'>Quote status:</Label>
                  <ExpiredQuote variant='body2'>
                    Expired -
                    <RefreshButton onClick={requestNewQuote} disabled={isQuoteLoading}>
                      {isQuoteLoading ? 'Getting new quote...' : 'Request new quote'}
                    </RefreshButton>
                  </ExpiredQuote>
                </Row>
              )}
            </>
          )}
          <Row>
            <Label variant='body2'>Value:</Label>
            <Tooltip title={valueTooltip} placement='top'>
              <Value variant='body2'>{valueText}</Value>
            </Tooltip>
          </Row>
        </Stack>
      )}

      <Row>
        <TotalValueLabel variant='body2'>{actionType !== EventType.EXIT ? 'Total:' : 'Value:'}</TotalValueLabel>
        <Tooltip title={totalTooltip} placement='top'>
          <TotalValue variant='body2'>{totalText}</TotalValue>
        </Tooltip>
      </Row>
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

const TotalValueLabel = styled(Label)(({ theme }) => ({
  color: theme.palette.grey[900],
}));

const TotalValue = styled(Value)(({ theme }) => ({
  color: theme.palette.grey[900],
}));

const QuoteTimer = styled(Value)(({ theme }) => ({
  fontWeight: 500,
  color: theme.palette.warning.main,
}));

const ExpiredQuote = styled(Value)(({ theme }) => ({
  fontWeight: 500,
  color: theme.palette.error.main,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
}));

const RefreshButton = styled('button')(({ theme }) => ({
  background: 'none',
  border: `1px solid ${theme.palette.primary.main}`,
  color: theme.palette.primary.main,
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.spacing(0.5),
  fontSize: '1.2rem',
  cursor: 'pointer',
  marginLeft: theme.spacing(1),

  '&:hover': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },

  '&:disabled': {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
}));
