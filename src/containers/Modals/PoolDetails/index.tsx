'use client';

import { Box, Divider, styled } from '@mui/material';
import { BaseModal } from '~/components';
import { ModalType } from '~/types';
import { Transaction } from '../ActivityDetails/Transaction';
import { DetailButtons } from './DetailsButtons';
import { DetailsHeader } from './DetailsHeader';
import { Resume } from './Resume';
import { WithdrawalsTable } from './WithdrawalsTable';

export const PoolDetails = () => {
  return (
    <BaseModal type={ModalType.PA_DETAILS} size='large'>
      <ModalContainer>
        <DetailsHeader />
        <Divider />

        <Resume />
        <Divider />

        <DetailButtons />
        <Divider />

        <WithdrawalsTable />
        <Divider />

        <Transaction />
      </ModalContainer>
    </BaseModal>
  );
};

export const ModalContainer = styled(Box)(() => {
  return {
    display: 'flex',
    padding: '2rem',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    '& > *': {
      zIndex: 1,
    },

    h2: {
      textTransform: 'capitalize',
    },
  };
});
