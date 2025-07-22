import { styled, Stack, Typography } from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { useAccountContext, usePoolAccountsContext, useChainContext } from '~/hooks';
import { EventType } from '~/types';

export const PoolAccountSection = () => {
  const {
    selectedPoolInfo: { asset },
    balanceBN: { decimals },
  } = useChainContext();

  const { amount, poolAccount, actionType, vettingFeeBPS } = usePoolAccountsContext();
  const { poolAccounts } = useAccountContext();
  const isDeposit = actionType === EventType.DEPOSIT;

  const poolAccountName = isDeposit ? `PA-${poolAccounts.length + 1}` : `PA-${poolAccount?.name}`;
  const fee = (vettingFeeBPS * parseUnits(amount, decimals)) / 100n / 100n;

  let totalAmountBN: bigint;
  if (isDeposit) {
    totalAmountBN = parseUnits(amount, decimals) - fee;
  } else {
    // For withdrawals, calculate remaining balance
    if (poolAccount?.balance) {
      try {
        const currentBalanceBN =
          typeof poolAccount.balance === 'string'
            ? parseUnits(poolAccount.balance, decimals)
            : BigInt(poolAccount.balance);
        const withdrawAmountBN = parseUnits(amount, decimals);
        totalAmountBN = currentBalanceBN - withdrawAmountBN;
      } catch (error) {
        console.error('Error calculating remaining balance:', error);
        totalAmountBN = 0n;
      }
    } else {
      totalAmountBN = 0n;
    }
  }

  const formattedTotalAmount = formatUnits(totalAmountBN, decimals);

  // For withdrawals, show remaining amount in a different layout
  if (!isDeposit) {
    return (
      <RemainingContainer>
        <RemainingText variant='body2'>Remaining in Pool Account: {poolAccountName}</RemainingText>
        <RemainingAmount variant='h6'>
          {formattedTotalAmount} {asset}
        </RemainingAmount>
      </RemainingContainer>
    );
  }

  return (
    <Container>
      <Row>
        <Label variant='body2'>Pool Account:</Label>
        <Value variant='body2'>{poolAccountName}</Value>
      </Row>
      <TotalValue variant='body2'>
        {formattedTotalAmount} {asset}
      </TotalValue>
    </Container>
  );
};

const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignContent: 'center',
  justifyContent: 'center',
  fontSize: '1.6rem',
  width: 'auto',
}));

const Row = styled(Stack)(() => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.6rem',
}));

const Label = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[900],
  fontSize: '1rem',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '150%',
}));

const Value = styled(Label)(() => ({
  fontSize: '1.4rem',
  fontWeight: 700,
}));

const TotalValue = styled(Value)(({ theme }) => ({
  color: theme.palette.grey[900],
  fontSize: '1.8rem',
  fontWeight: 300,
  textAlign: 'center',
}));

const RemainingContainer = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0',
  gap: '4px',
  width: '100%',
  height: '48px',
  // borderTop: `1px solid ${theme.palette.divider}`,
  //marginTop: '20px',
  //paddingTop: '20px',
}));

const RemainingText = styled(Typography)(({ theme }) => ({
  fontFamily: 'IBM Plex Mono',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '18px',
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

const RemainingAmount = styled(Typography)(({ theme }) => ({
  fontFamily: 'IBM Plex Mono',
  fontStyle: 'normal',
  fontWeight: 300,
  fontSize: '20px',
  lineHeight: '26px',
  textAlign: 'center',
  color: theme.palette.text.primary,
}));
