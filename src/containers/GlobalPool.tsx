'use client';

import { Box, Stack, styled, Typography } from '@mui/material';
import { formatUnits } from 'viem';
import { InfoTooltip } from '~/components/InfoTooltip';
import { useExternalServices, useChainContext } from '~/hooks';

export const GlobalPool = () => {
  const {
    balanceBN: { symbol, decimals: balanceDecimals },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const {
    aspData: { poolsData },
  } = useExternalServices();

  const decimals = assetDecimals ?? balanceDecimals ?? 18;

  const poolBalance = Number(formatUnits(BigInt(poolsData?.totalInPoolValue || 0), decimals)).toFixed(2);

  return (
    <HomeSection>
      <Section>
        <Stack direction='row' alignItems='center' gap={1}>
          <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
            Global Pool
          </Typography>
          <InfoTooltip message='This is the total funds in Privacy Pools.' />
        </Stack>
      </Section>

      <Section flexDirection='row' width='50%' alignItems='space-between'>
        <Stack width='50%' gap={1}>
          <Subtitle variant='caption' lineHeight='1'>
            Deposits made:
          </Subtitle>
          <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
            {poolsData?.totalDepositsCount || 0}
          </Typography>
        </Stack>

        <Stack width='50%' gap={1}>
          <Subtitle variant='caption' lineHeight='1'>
            In Privacy Pools:
          </Subtitle>
          <EthText variant='subtitle1' fontWeight='bold' lineHeight='1'>
            {poolBalance}
            <span>{symbol}</span>
          </EthText>
        </Stack>
      </Section>
    </HomeSection>
  );
};

const HomeSection = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'row',
  backgroundColor: theme.palette.background.default,
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
  },
}));

const Section = styled(Stack)(({ theme }) => ({
  padding: '1.6rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'start',
  width: '50%',
  '&:first-child': {
    borderRight: '1px solid',
  },
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    padding: 0,
    '&:first-child': {
      borderRight: 'none',
    },
  },
}));

const Subtitle = styled(Typography)(() => ({
  fontSize: '1rem',
}));

const EthText = styled(Typography)(() => ({
  fontWeight: 500,
  span: {
    fontSize: '1rem',
  },
}));
