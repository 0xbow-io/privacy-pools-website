'use client';

import { Stack, styled, Typography } from '@mui/material';
import { formatUnits } from 'viem';
import { ExtendedTooltip as Tooltip } from '~/components';
import { useExternalServices, usePoolAccountsContext, useChainContext, useTransactionFee } from '~/hooks';
import { EventType } from '~/types';
import { formatDataNumber, formatTimestamp, getUsdBalance, truncateAddress } from '~/utils';

export const DataSection = () => {
  const {
    selectedPoolInfo: { assetDecimals, asset, entryPointAddress },
    balanceBN: { decimals: balanceDecimals },
    price,
  } = useChainContext();
  const { vettingFeeBPS, selectedHistoryData } = usePoolAccountsContext();
  const { currentSelectedRelayerData } = useExternalServices();
  const isDeposit = selectedHistoryData?.type === EventType.DEPOSIT;
  const isExit = selectedHistoryData?.type === EventType.EXIT;
  const isWithdrawal = !isDeposit && !isExit;

  const aspOrRelayer = {
    label: isDeposit ? 'ASP' : 'Relayer',
    value: isDeposit ? '0xBow ASP' : 'Unknown Relayer',
  };

  // Temporarily disabled
  // const fromAddress = isDeposit ? selectedHistoryData?.address : '';
  // const toAddress = isDeposit ? '' : selectedHistoryData?.address;

  const decimals = assetDecimals ?? balanceDecimals ?? 18;
  const amountInWei = BigInt(selectedHistoryData?.amount ?? 0n);

  // Fetch actual fee from on-chain data for withdrawals
  const {
    fee: onChainFee,
    actualReceivedAmount,
    isLoading: isFeeLoading,
  } = useTransactionFee(isWithdrawal ? selectedHistoryData?.txHash : undefined, amountInWei);

  // For deposits, calculate fee from BPS. For withdrawals, use on-chain data if available.
  const feeBps = isDeposit ? vettingFeeBPS : BigInt(currentSelectedRelayerData?.fees ?? 0n);

  const denominator = 10000n - feeBps;
  const originalAmount = isDeposit ? (amountInWei * 10000n) / denominator : amountInWei;

  // Use on-chain fee for withdrawals if available, otherwise fall back to calculated fee
  const calculatedFees = (BigInt(feeBps) * BigInt(originalAmount)) / 100n / 100n;
  const fees = isWithdrawal && onChainFee !== null ? onChainFee : calculatedFees;

  const feeFormatted = formatDataNumber(fees, decimals);
  const feeUSD = price ? getUsdBalance(price, formatUnits(fees, decimals), decimals) : null;
  const feeText = isFeeLoading ? 'Loading...' : `${feeFormatted} ${asset}${feeUSD ? ` (~ ${feeUSD} USD)` : ''}`;

  const feesCollectorAddress = isDeposit ? entryPointAddress : currentSelectedRelayerData?.relayerAddress;
  const feesCollector = `OxBow (${truncateAddress(feesCollectorAddress ?? '0x')})`;

  const totalText = isDeposit ? formatUnits(originalAmount, decimals) : formatUnits(amountInWei, decimals);
  const totalUSD = price ? getUsdBalance(price, totalText, decimals) : null;
  const valueText = `~${totalText.slice(0, 6)} ${asset}${totalUSD ? ` (~ ${totalUSD} USD)` : ''}`;

  // Use on-chain received amount for withdrawals if available
  const amountWithFee = isWithdrawal && actualReceivedAmount !== null ? actualReceivedAmount : originalAmount - fees;
  const amountWithFeeUSD = price ? getUsdBalance(price, formatUnits(amountWithFee, decimals), decimals) : null;
  const receivedText = isFeeLoading
    ? 'Loading...'
    : `${formatUnits(amountWithFee, decimals)} ${asset}${amountWithFeeUSD ? ` (~ ${amountWithFeeUSD} USD)` : ''}`;

  // const poolAccountName = useMemo(() => {
  //   const name = poolAccounts.find((pool) => pool.label === selectedHistoryData?.commitment?.preimage?.label)?.name;
  //   return name ? `Pool Account ${name} (PA-${name})` : 'Unknown Pool Account';
  // }, [poolAccounts, selectedHistoryData]);

  return (
    <Container>
      <SDate variant='caption'>{formatTimestamp(selectedHistoryData?.timestamp?.toString() ?? '0', true)}</SDate>

      {/* <Stack>
        <Row>
          <Label variant='body2'>From:</Label>
          <Value variant='body2'>
            <Tooltip title={fromAddress} placement='top'>
              <span>
                {fromAddress && truncateAddress(fromAddress)}
                {!fromAddress && poolAccountName}
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
                {!toAddress && poolAccountName}
              </span>
            </Tooltip>
          </Value>
        </Row>
      </Stack> */}

      <Stack>
        <Row>
          <Label variant='body2'>Total:</Label>
          <Value variant='body2'>{valueText}</Value>
        </Row>

        {!isExit && (
          <Row>
            <Label variant='body2'>Received:</Label>
            <Value variant='body2'>{receivedText}</Value>
          </Row>
        )}
      </Stack>

      {!isExit && (
        <Stack>
          <Row>
            <Label variant='body2'>{aspOrRelayer.label}:</Label>
            <Value variant='body2'>{aspOrRelayer.value}</Value>
          </Row>
          <Row>
            <Label variant='body2'>Fees:</Label>
            <Value variant='body2'>{feeText}</Value>
          </Row>
          {isDeposit && (
            <Row>
              <Label variant='body2'>Fees Collector:</Label>
              <Tooltip title={feesCollectorAddress} placement='top'>
                <Value variant='body2'>{feesCollector}</Value>
              </Tooltip>
            </Row>
          )}
        </Stack>
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

const Row = styled(Stack)(() => ({
  gap: '0.6rem',
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
}));

export const Label = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1.6rem',
  fontStyle: 'normal',
  fontWeight: 700,
  lineHeight: '150%',
}));

const Value = styled(Label)(() => ({
  fontWeight: 400,
}));

const SDate = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1rem',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '150%',
}));
