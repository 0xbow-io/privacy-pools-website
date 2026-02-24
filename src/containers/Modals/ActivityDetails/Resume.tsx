import { useMemo } from 'react';
import { Stack, Typography, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { ExtendedTooltip as Tooltip, StatusChip } from '~/components';
import { getConstants } from '~/config/constants';
import { useAccountContext, usePoolAccountsContext, useChainContext } from '~/hooks';
import { ReviewStatus } from '~/types';
import { getUsdBalance, getStatus } from '~/utils';

export const Resume = () => {
  const { PENDING_STATUS_MESSAGE } = getConstants();
  const { poolAccounts } = useAccountContext();
  const { selectedHistoryData } = usePoolAccountsContext();
  const {
    price,
    balanceBN: { decimals: balanceDecimals },
    selectedPoolInfo: { assetDecimals, asset },
  } = useChainContext();

  const decimals = assetDecimals ?? balanceDecimals ?? 18;

  const amount = formatUnits(selectedHistoryData?.amount ?? 0n, decimals);
  const usdBalance = price
    ? getUsdBalance(price, formatUnits(selectedHistoryData?.amount ?? 0n, decimals), decimals)
    : null;
  const poolAccountName = useMemo(() => {
    const name = poolAccounts.find((pool) => pool.deposit.label === selectedHistoryData?.label)?.name;
    return name ? `PA-${name}` : 'Unknown Pool Account';
  }, [poolAccounts, selectedHistoryData]);

  const status = getStatus(selectedHistoryData || {});
  const tooltipTitle = status === ReviewStatus.PENDING ? PENDING_STATUS_MESSAGE : '';

  return (
    <Stack direction='row' justifyContent='space-between' alignItems='start' width='100%'>
      <Stack direction='column' alignItems='start' gap='0.8rem'>
        <EthText variant='h6'>
          {amount}
          <span>{asset}</span>
        </EthText>
        {usdBalance && <BalanceUsd variant='body2'>{`~ ${usdBalance}`}</BalanceUsd>}
      </Stack>

      <Stack direction='column' alignItems='end' gap='1.4rem'>
        <Typography variant='body2'>{poolAccountName}</Typography>
        <Tooltip title={tooltipTitle} placement='top' disableInteractive>
          <StatusChip status={status} />
        </Tooltip>
      </Stack>
    </Stack>
  );
};

const EthText = styled(Typography)({
  fontWeight: 300,
  fontSize: '4rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  lineHeight: '0.8',
  span: {
    fontSize: '2rem',
    marginLeft: '0.4rem',
  },
});

const BalanceUsd = styled(Typography)({
  fontWeight: 300,
  fontSize: '1.2rem',
});
