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

  const totalAmountBN = isDeposit ? parseUnits(amount, decimals) - fee : parseUnits(amount, decimals);
  const formattedTotalAmount = formatUnits(totalAmountBN, decimals);

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
