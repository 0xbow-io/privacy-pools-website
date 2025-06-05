'use client';
import { Stack, styled, Typography } from '@mui/material';
import { ExtendedTooltip as Tooltip } from '~/components';
import { usePoolAccountsContext } from '~/hooks';
import { EventType } from '~/types';
import { truncateAddress } from '~/utils';

export const DataSection = () => {
  const { target, actionType, poolAccount } = usePoolAccountsContext();
  const isWithdrawal = actionType === EventType.WITHDRAWAL;

  if (!isWithdrawal) {
    return null;
  }

  const toAddress = target;

  return (
    <Container>
      <Stack>
        <Row>
          <Label variant='body2'>From:</Label>
          <Value variant='body2'>
            <Tooltip title={`PA-${poolAccount?.name}`} placement='top'>
              <span>{`PA-${poolAccount?.name}`}</span>
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
