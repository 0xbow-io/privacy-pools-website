'use client';

import { Button, styled } from '@mui/material';
import { useAccount } from 'wagmi';
import { useModal, usePoolAccountsContext, useAccountContext } from '~/hooks';
import { useChainContext } from '~/hooks/context/useChainContext';
import { EventType, ModalType } from '~/types';

export const WithdrawAssetSelect: React.FC = () => {
  const { hasSomeRelayerAvailable } = useChainContext();
  const { setModalOpen } = useModal();
  const { setActionType } = usePoolAccountsContext();
  const { hasApprovedDeposit, seed } = useAccountContext();
  const { address } = useAccount();

  const isWithdrawDisabled = !address || !hasApprovedDeposit || !seed || !hasSomeRelayerAvailable;

  const handleClick = () => {
    setModalOpen(ModalType.WITHDRAW);
    setActionType(EventType.WITHDRAWAL);
  };

  return (
    <StyledWithdrawButton fullWidth disabled={isWithdrawDisabled} onClick={handleClick} data-testid='withdraw-button'>
      Withdraw
    </StyledWithdrawButton>
  );
};

const StyledWithdrawButton = styled(Button)(({ theme }) => ({
  minWidth: '140px',
  backgroundColor: theme.palette.common.black,
  color: theme.palette.common.white,
  fontWeight: 500,
  height: '40px',
  borderRadius: '4px',
  border: 'none',
  '&:hover': {
    backgroundColor: theme.palette.grey[900],
  },
  '&.Mui-disabled': {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.text.disabled,
  },
}));
