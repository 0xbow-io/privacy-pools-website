import { Exit, PiggyBank, WatsonHealthRotate_360 } from '@carbon/icons-react';
import { Button, Stack, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { useModal, usePoolAccountsContext, useChainContext } from '~/hooks';
import { EventType, ModalType, ReviewStatus } from '~/types';

export const DetailButtons = () => {
  const { address } = useAccount();
  const { setModalOpen } = useModal();
  const { poolAccount, setTarget, setAmount, setActionType } = usePoolAccountsContext();
  const {
    balanceBN: { decimals },
  } = useChainContext();
  const isWithdrawDisabled = poolAccount?.balance === 0n || poolAccount?.reviewStatus !== ReviewStatus.APPROVED;
  const isExitDisabled = poolAccount?.balance === 0n;

  const handleWithdraw = () => {
    if (isWithdrawDisabled) return;

    setActionType(EventType.WITHDRAWAL);
    setModalOpen(ModalType.WITHDRAW);
  };

  const handleExit = () => {
    if (isExitDisabled) return;
    if (!poolAccount) throw new Error('Pool account not found');

    setTarget(address!);
    setAmount(formatUnits(poolAccount.balance, decimals));
    setActionType(EventType.EXIT);
    setModalOpen(ModalType.GENERATE_ZK_PROOF);
  };

  return (
    <Stack direction='row' justifyContent='space-between' alignItems='center' width='100%' gap='1.2rem'>
      {poolAccount?.reviewStatus !== ReviewStatus.DECLINED && (
        <Button disabled={isWithdrawDisabled} fullWidth onClick={handleWithdraw} startIcon={<PiggyBank size={16} />}>
          Withdraw
        </Button>
      )}

      <Button disabled={isExitDisabled} fullWidth onClick={handleExit} startIcon={<ExitIcon size={16} />}>
        Exit
      </Button>

      {poolAccount?.reviewStatus === ReviewStatus.DECLINED && (
        <Button disabled fullWidth startIcon={<WatsonHealthRotate_360 size={16} />}>
          Re-Evaluate
        </Button>
      )}
    </Stack>
  );
};

const ExitIcon = styled(Exit)(() => ({
  transform: 'rotate(180deg)',
}));
