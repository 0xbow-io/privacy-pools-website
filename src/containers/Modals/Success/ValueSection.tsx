import { useMemo } from 'react';
import { Stack, styled, Typography } from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { usePoolAccountsContext, useChainContext, useAccountContext } from '~/hooks';
import { EventType } from '~/types';

export const ValueSection = () => {
  const { amount, poolAccount, actionType, vettingFeeBPS } = usePoolAccountsContext();
  const { poolAccounts } = useAccountContext();
  const {
    balanceBN: { symbol, decimals },
  } = useChainContext();

  const paText = actionType === EventType.DEPOSIT ? 'To pool account' : 'From pool account';
  const paName =
    actionType === EventType.DEPOSIT ? `PA-${poolAccounts[poolAccounts.length - 1]?.name}` : `PA-${poolAccount?.name}`;

  const isDeposit = actionType === EventType.DEPOSIT;

  const fee = (vettingFeeBPS * parseUnits(amount, decimals)) / 100n / 100n;

  const totalAmountBN = isDeposit ? parseUnits(amount, decimals) - fee : parseUnits(amount, decimals);
  const formattedTotalAmount = formatUnits(totalAmountBN, decimals);

  const remainingBalance = useMemo(() => {
    const pa = poolAccounts.find((pa) => pa.label === poolAccount?.label);
    return formatUnits(pa?.balance ?? BigInt(0), decimals);
  }, [poolAccount, poolAccounts, decimals]);

  return (
    <Container>
      <Stack gap={1}>
        <Stack gap='1rem' direction='row' justifyContent='center' alignItems='center'>
          <Value variant='body1'>{formattedTotalAmount}</Value>
          <Symbol variant='body1'>{symbol}</Symbol>
        </Stack>
        <Stack gap='1rem' direction='row' justifyContent='center' alignItems='center'>
          <Text variant='body2'>{paText}:</Text>
          <Strong variant='body2'>{paName}</Strong>
        </Stack>
        {actionType === EventType.WITHDRAWAL && (
          <Stack gap='1rem' direction='row' justifyContent='center' alignItems='center'>
            <Typography variant='caption' color='grey.600'>
              Remaining balance:
            </Typography>
            <Typography variant='caption' fontWeight={700}>
              {remainingBalance} {symbol}
            </Typography>
          </Stack>
        )}
      </Stack>

      {actionType === EventType.DEPOSIT && (
        <>
          <Text variant='body2'>
            The ASP will validate that the funds are coming from a good actor (not a flagged account).
          </Text>
          <Strong>Estimated period: Up to 7 days.</Strong>
        </>
      )}
    </Container>
  );
};

const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignContent: 'center',
  justifyContent: 'center',
  fontSize: '1.6rem',
  width: '100%',
  maxWidth: '31.2rem',
  gap: '2rem',
}));

const Value = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[900],
  fontSize: '6.4rem',
  fontWeight: 300,
  lineHeight: '100%',
}));

const Symbol = styled(Value)(({ theme }) => ({
  color: theme.palette.grey[900],
  fontSize: '3.2rem',
  fontWeight: 300,
}));

const Text = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[600],
  fontSize: '1.4rem',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: 'normal',
  textAlign: 'center',
}));

const Strong = styled(Text)(() => ({
  fontWeight: 700,
  textAlign: 'center',
}));
