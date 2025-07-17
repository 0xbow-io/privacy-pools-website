'use client';

import { useState, useEffect } from 'react';
import { Box, Button, CircularProgress, Divider, Stack, styled } from '@mui/material';
import { parseUnits } from 'viem';
import { BaseModal } from '~/components';
import {
  useDeposit,
  useExit,
  useModal,
  usePoolAccountsContext,
  useWithdraw,
  useExternalServices,
  useChainContext,
  useRequestQuote,
  useNotifications,
} from '~/hooks';
import { EventType, ModalType } from '~/types';
import { ModalContainer, ModalTitle } from '../Deposit';
import { LinksSection } from '../LinksSection';
import { DataSection } from './DataSection';
import { ExitMessage } from './ExitMessage';
import { PoolAccountSection } from './PoolAccountSection';

export const ReviewModal = () => {
  const { isClosable, setModalOpen } = useModal();
  const { deposit, isLoading: isDepositLoading } = useDeposit();
  const { isLoading: isWithdrawLoading } = useWithdraw();
  const { isLoading: isExitLoading } = useExit();
  const { actionType, feeCommitment, amount, target } = usePoolAccountsContext();
  const [isConfirmClicked, setIsConfirmClicked] = useState(false);

  // Quote logic for withdrawals
  const {
    balanceBN: { decimals },
    selectedPoolInfo,
    chainId,
  } = useChainContext();
  const { currentSelectedRelayerData, relayerData } = useExternalServices();
  const { addNotification } = useNotifications();

  const amountBN = parseUnits(amount, decimals);
  const { getQuote, isQuoteLoading } = relayerData || {};
  const { isQuoteValid, isExpired, requestNewQuote } = useRequestQuote({
    getQuote: getQuote || (() => Promise.reject(new Error('No relayer data'))),
    isQuoteLoading: isQuoteLoading || false,
    quoteError: null,
    chainId,
    amountBN,
    assetAddress: selectedPoolInfo?.assetAddress,
    recipient: target,
    isValidAmount: amountBN > 0n,
    isRecipientAddressValid: !!target,
    isRelayerSelected: !!currentSelectedRelayerData?.relayerAddress,
    addNotification,
  });

  const isLoading = isDepositLoading || isExitLoading || isWithdrawLoading;

  // For withdrawals, check if we have a valid fee commitment and quote
  // For exits and deposits, no fee commitment check is needed
  const isActionReady = actionType === EventType.WITHDRAWAL ? !!feeCommitment && isQuoteValid : true;
  const isConfirmDisabled = isLoading || isConfirmClicked || !isActionReady;

  const handleConfirm = () => {
    setIsConfirmClicked(true);
    if (actionType === EventType.DEPOSIT) {
      deposit();
    } else if (actionType === EventType.WITHDRAWAL) {
      // Open proof generation modal for withdrawals
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    } else if (actionType === EventType.EXIT) {
      // Open proof generation modal for exits
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    }
  };

  const handleRequestNewQuote = async () => {
    await requestNewQuote();
  };

  // Reset isConfirmClicked when modal opens or when starting a new action
  useEffect(() => {
    setIsConfirmClicked(false);
  }, [actionType, amount, target]);

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

        {actionType === EventType.WITHDRAWAL && isExpired ? (
          <PulsingButton
            disabled={isQuoteLoading}
            onClick={handleRequestNewQuote}
            data-testid='request-new-quote-button'
          >
            {isQuoteLoading && <CircularProgress size='1.6rem' />}
            {isQuoteLoading ? 'Getting new quote...' : 'Request new quote'}
          </PulsingButton>
        ) : (
          <SButton disabled={isConfirmDisabled} onClick={handleConfirm} data-testid='confirm-review-button'>
            {(isLoading || isConfirmClicked) && <CircularProgress size='1.6rem' />}
            {!isLoading &&
              !isConfirmClicked &&
              actionType === EventType.WITHDRAWAL &&
              !feeCommitment &&
              'Waiting for quote...'}
            {!isLoading && !isConfirmClicked && (actionType !== EventType.WITHDRAWAL || !!feeCommitment) && 'Confirm'}
          </SButton>
        )}

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

const PulsingButton = styled(Button)({
  minWidth: '10rem',
  animation: 'pulse 1s 3',

  '@keyframes pulse': {
    '0%': {
      transform: 'scale(1)',
    },
    '50%': {
      transform: 'scale(1.05)',
    },
    '100%': {
      transform: 'scale(1)',
    },
  },
});
