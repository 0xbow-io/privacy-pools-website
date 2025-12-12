'use client';

import { Box, Button, Stack, styled, Typography } from '@mui/material';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { BaseModal } from '~/components';
import { useModal, usePoolAccountsContext, useChainContext } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { LinksSection } from '../LinksSection';

export const ExitConfirmModal = () => {
  return (
    <BaseModal type={ModalType.EXIT_CONFIRM} hasBackground>
      <ExitConfirmForm />
    </BaseModal>
  );
};

const ExitConfirmForm = () => {
  const { address } = useAccount();
  const { setModalOpen } = useModal();
  const { poolAccount, setTarget, setAmount, setActionType } = usePoolAccountsContext();
  const {
    balanceBN: { decimals },
  } = useChainContext();

  const handleConfirmExit = () => {
    if (!poolAccount || !address) return;

    setTarget(address);
    setAmount(formatUnits(poolAccount.balance, decimals));
    setActionType(EventType.EXIT);
    setModalOpen(ModalType.GENERATE_ZK_PROOF);
  };

  const handleCancel = () => {
    setModalOpen(ModalType.PA_DETAILS);
  };

  return (
    <ModalContainer>
      <DecorativeCircle />

      <ModalTitle variant='h2'>Rage Quit Privacy Pools</ModalTitle>

      <DescriptionText>
        By exiting this Pool, you are withdrawing all funds you have shielded or pending to your depositing address.{' '}
        <strong>You will not gain any privacy.</strong>
      </DescriptionText>

      <QuestionText>Are you sure you want to continue?</QuestionText>

      <ButtonsContainer>
        <AcceptButton onClick={handleConfirmExit}>Accept and exit</AcceptButton>

        <CancelButton variant='outlined' onClick={handleCancel}>
          Cancel
        </CancelButton>
      </ButtonsContainer>

      <LinksSection />
    </ModalContainer>
  );
};

const ModalContainer = styled(Box)(() => ({
  display: 'flex',
  padding: '3.6rem 2.4rem',
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
}));

const DecorativeCircle = styled(Box)(({ theme }) => ({
  width: '647px',
  height: '646px',
  position: 'absolute',
  borderRadius: '50%',
  backgroundColor: theme.palette.background.default,
  border: '1px solid #D9D9D9',
  zIndex: 0,
  top: '78%',
}));

const ModalTitle = styled(Typography)(() => ({
  fontSize: '2.4rem',
  fontWeight: 700,
  lineHeight: 'normal',
  width: '100%',
  textAlign: 'center',
}));

const DescriptionText = styled(Typography)(({ theme }) => ({
  fontSize: '1.4rem',
  fontWeight: 400,
  lineHeight: '1.6',
  color: theme.palette.text.secondary,
  textAlign: 'center',
  maxWidth: '400px',
}));

const QuestionText = styled(Typography)(() => ({
  fontSize: '1.4rem',
  fontWeight: 400,
  lineHeight: '1.6',
  textAlign: 'center',
  marginTop: '0.5rem',
}));

const ButtonsContainer = styled(Stack)(() => ({
  width: '100%',
  gap: '1.2rem',
  marginTop: '1rem',
}));

const AcceptButton = styled(Button)(({ theme }) => ({
  zIndex: 1,
  backgroundColor: theme.palette.grey[900],
  color: theme.palette.common.white,
  '&:hover': {
    backgroundColor: theme.palette.grey[800],
  },
}));

const CancelButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.background.default,
  color: theme.palette.text.primary,
  border: `1px solid ${theme.palette.grey[900]}`,
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
    border: `1px solid ${theme.palette.grey[900]}`,
  },
}));
