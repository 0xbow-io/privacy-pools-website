'use client';

import { Button, styled } from '@mui/material';
import { useAccount } from 'wagmi';
import { useModal, usePoolAccountsContext, useAccountContext } from '~/hooks';
import { useChainContext } from '~/hooks/context/useChainContext';
import { EventType, ModalType } from '~/types';

export const DepositAssetSelect: React.FC = () => {
  const { maxDeposit } = useChainContext();
  const { setModalOpen } = useModal();
  const { setActionType } = usePoolAccountsContext();
  const { seed } = useAccountContext();
  const { address } = useAccount();

  const isDepositDisabled = !address || !seed || !BigInt(maxDeposit);

  const handleClick = () => {
    setModalOpen(ModalType.DEPOSIT);
    setActionType(EventType.DEPOSIT);
  };

  return (
    <StyledDepositButton fullWidth disabled={isDepositDisabled} onClick={handleClick} data-testid='deposit-button'>
      Deposit
    </StyledDepositButton>
  );
};

const StyledDepositButton = styled(Button)(({ theme }) => ({
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
