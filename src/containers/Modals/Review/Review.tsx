'use client';

import { Box, Button, CircularProgress, Divider, Stack, styled } from '@mui/material';
import { BaseModal } from '~/components';
import { useDeposit, useExit, useModal, usePoolAccountsContext, useWithdraw } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { ModalContainer, ModalTitle } from '../Deposit';
import { LinksSection } from '../LinksSection';
import { DataSection } from './DataSection';
import { ExitMessage } from './ExitMessage';
import { PoolAccountSection } from './PoolAccountSection';

export const ReviewModal = () => {
  const { isClosable } = useModal();
  const { deposit, isLoading: isDepositLoading } = useDeposit();
  const { withdraw, isLoading: isWithdrawLoading } = useWithdraw();
  const { exit, isLoading: isExitLoading } = useExit();
  const { actionType } = usePoolAccountsContext();

  const isLoading = isDepositLoading || isExitLoading || isWithdrawLoading;

  const handleConfirm = () => {
    if (actionType === EventType.DEPOSIT) {
      deposit();
    } else if (actionType === EventType.WITHDRAWAL) {
      withdraw();
    } else if (actionType === EventType.EXIT) {
      exit();
    }
  };

  return (
    <BaseModal type={ModalType.REVIEW} hasBackground isClosable={isClosable}>
      <ModalContainer>
        <DecorativeCircle actionType={actionType!} />

        <ModalTitle>Review the {actionType}</ModalTitle>

        <Stack gap={2} px='1.6rem' width='100%'>
          <Divider />

          <DataSection />

          <Divider />
        </Stack>

        <PoolAccountSection />

        {actionType === EventType.EXIT && <ExitMessage />}

        <SButton disabled={isLoading} onClick={handleConfirm} data-testid='confirm-review-button'>
          {isLoading && <CircularProgress size='1.6rem' />}
          {!isLoading && 'Confirm'}
        </SButton>

        <LinksSection />
      </ModalContainer>
    </BaseModal>
  );
};

const DecorativeCircle = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'actionType',
})<{ actionType: EventType }>(({ theme, actionType }) => {
  return {
    width: '70rem',
    height: '70rem',
    position: 'absolute',
    borderRadius: '50%',
    backgroundColor: theme.palette.background.default,
    border: '1px solid #D9D9D9',
    zIndex: 0,
    top: actionType === EventType.EXIT ? '-36%' : '-43%',
    [theme.breakpoints.down('sm')]: {
      top: actionType === EventType.EXIT ? '-36%' : '-23%',
    },
  };
});

const SButton = styled(Button)({
  minWidth: '10rem',
});
