'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Button, styled } from '@mui/material';
import { useAccount, useSwitchChain } from 'wagmi';
import { allPoolsChainData } from '~/config';
import { useModal, usePoolAccountsContext, useAccountContext, useNotifications } from '~/hooks';
import { useChainContext } from '~/hooks/context/useChainContext';
import { EventType, ModalType, ReviewStatus } from '~/types';

export const WithdrawAssetSelect: React.FC = () => {
  const pathname = usePathname();
  const { hasSomeRelayerAvailable, chainId, setSelectedAsset, selectedPoolInfo } = useChainContext();
  const { setModalOpen } = useModal();
  const { setActionType } = usePoolAccountsContext();
  const { poolAccountsByChainScope, seed } = useAccountContext();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { addNotification } = useNotifications();

  // Check if we're on a pool page (e.g., /pools/42161/usdc)
  const isOnPoolPage = pathname?.startsWith('/pools/');

  // Find the first pool account with approved deposit and balance > 0 across ALL chains/pools
  const firstPoolWithFunds = useMemo(() => {
    for (const [key, accounts] of Object.entries(poolAccountsByChainScope)) {
      const approvedWithBalance = accounts.find(
        (acc) => acc.reviewStatus === ReviewStatus.APPROVED && acc.balance > 0n,
      );
      if (approvedWithBalance) {
        const [chainIdStr, scope] = key.split('-');
        const poolChainId = parseInt(chainIdStr, 10);
        // Find the asset for this scope
        const chainInfo = allPoolsChainData[poolChainId];
        const poolInfo = chainInfo?.poolInfo.find((p) => p.scope.toString() === scope);
        if (poolInfo) {
          return {
            chainId: poolChainId,
            asset: poolInfo.asset,
            chainName: chainInfo.name,
          };
        }
      }
    }
    return null;
  }, [poolAccountsByChainScope]);

  // Check if current pool has approved deposits (for pool pages)
  const currentPoolHasApprovedDeposit = useMemo(() => {
    if (!isOnPoolPage || !selectedPoolInfo?.scope) return true; // Not on pool page, don't restrict
    const scopeKey = `${chainId}-${selectedPoolInfo.scope}`;
    const accounts = poolAccountsByChainScope[scopeKey] || [];
    return accounts.some((acc) => acc.reviewStatus === ReviewStatus.APPROVED && acc.balance > 0n);
  }, [isOnPoolPage, chainId, selectedPoolInfo?.scope, poolAccountsByChainScope]);

  const hasAnyApprovedDeposit = !!firstPoolWithFunds;
  const isWithdrawDisabled =
    !address ||
    !hasAnyApprovedDeposit ||
    !seed ||
    !hasSomeRelayerAvailable ||
    (isOnPoolPage && !currentPoolHasApprovedDeposit);

  const handleClick = () => {
    // Only auto-switch to firstPoolWithFunds when NOT on a pool page.
    // On pool pages, the PoolPage component already sets the correct asset.
    if (!isOnPoolPage && firstPoolWithFunds) {
      // Switch chain if needed
      if (firstPoolWithFunds.chainId !== chainId) {
        try {
          switchChain({ chainId: firstPoolWithFunds.chainId });
          addNotification('info', `Switching to ${firstPoolWithFunds.chainName}...`);
        } catch (err) {
          console.error('Failed to switch chain:', err);
        }
      }
      // Set the selected asset to the pool with funds
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedAsset(firstPoolWithFunds.asset as any);
    }
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
