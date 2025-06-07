import { Stack, styled, Typography } from '@mui/material';
import { formatUnits } from 'viem';
import { usePoolAccountsContext, useChainContext } from '~/hooks';
import { formatTimestamp } from '~/utils';

export const Resume = () => {
  const {
    balanceBN: { symbol, decimals },
  } = useChainContext();
  const { poolAccount } = usePoolAccountsContext();

  return (
    <Stack
      direction={['column', 'row']}
      justifyContent='space-between'
      alignItems={['start', 'center']}
      gap={['0.8rem', '0']}
      width='100%'
    >
      <Stack direction='column' alignItems='start' gap='0.8rem'>
        <Label variant='body2'>Total balance</Label>
        <EthText variant='h6'>
          {formatUnits(poolAccount?.balance ?? BigInt(0), decimals)}
          <span>{symbol}</span>
        </EthText>
      </Stack>

      <Stack direction='column' alignItems='start' gap='0.2rem' minWidth='30rem'>
        <Label variant='body2'>Date created:</Label>
        <Value variant='body2'>{formatTimestamp(poolAccount?.deposit.timestamp?.toString() ?? '', true)}</Value>
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

export const Label = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1.2rem',
  fontStyle: 'normal',
  fontWeight: 700,
  lineHeight: '150%',
  textTransform: 'uppercase',
}));

const Value = styled(Label)(() => ({
  fontWeight: 400,
  textTransform: 'none',
}));
