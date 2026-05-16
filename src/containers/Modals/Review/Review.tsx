'use client';

import { useState, useEffect, useCallback } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Button, CircularProgress, Stack, styled, Typography } from '@mui/material';
import { parseUnits } from 'viem';
import { BaseModal } from '~/components';
import { useQuoteContext } from '~/contexts/QuoteContext';
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
  const { quoteState, clearPendingQuoteRequest } = useQuoteContext();

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
  const { isQuoteValid, isExpired, quotedAmount, canRequestQuote, requestNewQuote } = useRequestQuote({
    getQuote: getQuote || (() => Promise.reject(new Error('No relayer data'))),
    isQuoteLoading: isQuoteLoading || false,
    quoteError: null,
    chainId,
    amountBN,
    assetAddress: selectedPoolInfo?.assetAddress,
    recipient: target,
    relayerUrl: currentSelectedRelayerData?.url,
    isValidAmount: amountBN > 0n,
    isRecipientAddressValid: !!target,
    isRelayerSelected: !!currentSelectedRelayerData?.relayerAddress,
    addNotification,
  });

  const isLoading = isDepositLoading || isExitLoading || isWithdrawLoading;

  // For withdrawals, check if we have a valid fee commitment and quote
  // For exits and deposits, no fee commitment check is needed
  const isActionReady = actionType === EventType.WITHDRAWAL ? !!feeCommitment && isQuoteValid : true;
  const isConfirmDisabled =
    isLoading || isConfirmClicked || !isActionReady || (isQuoteLoading && actionType === EventType.WITHDRAWAL);

  // Request quote when pendingQuoteRequest is true (triggered by clicking "Review Withdrawal")
  useEffect(() => {
    if (actionType === EventType.WITHDRAWAL && canRequestQuote && quoteState.pendingQuoteRequest) {
      clearPendingQuoteRequest();

      const currentAmountStr = amountBN.toString();
      const hasValidQuoteForAmount = quotedAmount === currentAmountStr && !isExpired && isQuoteValid;

      // Only request new quote if amount changed or quote is expired/invalid
      if (!hasValidQuoteForAmount) {
        requestNewQuote();
      }
    }
  }, [
    actionType,
    canRequestQuote,
    quoteState.pendingQuoteRequest,
    clearPendingQuoteRequest,
    requestNewQuote,
    amountBN,
    quotedAmount,
    isExpired,
    isQuoteValid,
  ]);

  const handleConfirm = useCallback(async () => {
    if (actionType === EventType.DEPOSIT) {
      setIsConfirmClicked(true);
      deposit();
    } else if (actionType === EventType.WITHDRAWAL) {
      const currentAmountStr = amountBN.toString();
      // Check if quote is valid and matches current amount
      const needsNewQuote = quotedAmount !== currentAmountStr || !isQuoteValid || isExpired;
      if (needsNewQuote) {
        // Quote invalid or amount changed, need to refetch
        await requestNewQuote();
        // Don't proceed - user will need to click confirm again with the new quote
        addNotification('warning', 'Quote refreshed. Please review and confirm.');
        return;
      }
      setIsConfirmClicked(true);
      // Open proof generation modal for withdrawals
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    } else if (actionType === EventType.EXIT) {
      setIsConfirmClicked(true);
      // Open proof generation modal for exits
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    }
  }, [
    actionType,
    amountBN,
    quotedAmount,
    isQuoteValid,
    isExpired,
    requestNewQuote,
    addNotification,
    deposit,
    setModalOpen,
  ]);

  const handleRequestNewQuote = async () => {
    await requestNewQuote();
  };

  const handleGoBack = () => {
    if (actionType === EventType.WITHDRAWAL) {
      setModalOpen(ModalType.WITHDRAW);
    } else if (actionType === EventType.DEPOSIT) {
      setModalOpen(ModalType.DEPOSIT);
    }
    // For EXIT, we might want to go back to pool details or another modal
  };

  // Reset isConfirmClicked when modal opens or when starting a new action
  useEffect(() => {
    setIsConfirmClicked(false);
  }, [actionType, amount, target]);

  return (
    <BaseModal type={ModalType.REVIEW} hasBackground isClosable={isClosable}>
      <ModalContainer>
        <DecorativeCircle actionType={actionType!} />

        {(actionType === EventType.WITHDRAWAL || actionType === EventType.DEPOSIT) && (
          <BackButton onClick={handleGoBack}>
            <svg width='16' height='14' viewBox='0 0 16 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
              <path
                d='M6.75 13.25L7.63125 12.3688L2.89375 7.625H15.5V6.375H2.89375L7.63125 1.63125L6.75 0.75L0.5 7L6.75 13.25Z'
                fill='black'
              />
            </svg>
          </BackButton>
        )}

        <ModalTitle>Review the {actionType}</ModalTitle>

        <Stack gap={2} px='1.6rem' width='100%'>
          {actionType === EventType.WITHDRAWAL &&
            selectedPoolInfo?.isStableAsset &&
            selectedPoolInfo?.asset !== 'frxUSD' &&
            selectedPoolInfo?.asset !== 'WOETH' &&
            quoteState.extraGas && (
              <GasTokenDropSection>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InfoIcon />
                    <GasTokenDropTitle variant='body1' fontWeight={600}>
                      Gas Token Drop
                    </GasTokenDropTitle>
                  </Box>
                  <GasTokenDropDescription>Get ETH for gas fees (1 swap + 1 transfer)</GasTokenDropDescription>
                </Box>
              </GasTokenDropSection>
            )}

          <DataSection />
        </Stack>

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
            {(isLoading || isConfirmClicked || (isQuoteLoading && actionType === EventType.WITHDRAWAL)) && (
              <CircularProgress size='1.6rem' sx={{ mr: 1 }} />
            )}
            {!isLoading &&
              !isConfirmClicked &&
              actionType === EventType.WITHDRAWAL &&
              (isQuoteLoading || !feeCommitment) &&
              'Getting quote...'}
            {!isLoading &&
              !isConfirmClicked &&
              !isQuoteLoading &&
              (actionType !== EventType.WITHDRAWAL || !!feeCommitment) &&
              'Confirm'}
          </SButton>
        )}
        <PoolAccountSection />

        <LinksSection
          context={
            actionType === EventType.EXIT ? 'ragequit' : actionType === EventType.WITHDRAWAL ? 'withdrawal' : 'deposit'
          }
        />
      </ModalContainer>
    </BaseModal>
  );
};
const getTopDecorativeCirclePosition = (actionType: EventType, mobile: boolean) => {
  switch (actionType) {
    case EventType.EXIT:
      return '-36%';
    case EventType.WITHDRAWAL:
      return '-5%';
    default:
      return mobile ? '-23%' : '-43%';
  }
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
    top: getTopDecorativeCirclePosition(actionType, false),
    [theme.breakpoints.down('sm')]: {
      top: getTopDecorativeCirclePosition(actionType, true),
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

const GasTokenDropSection = styled(Box)(() => ({
  padding: '1rem 1.5rem',
  background: 'rgba(223, 236, 198, 0.5)',
  border: '1px solid #7D9C40',
  margin: '0.5rem 0',
  display: 'flex',
  alignItems: 'center',
}));

const InfoIcon = styled(InfoOutlinedIcon)(() => ({
  color: '#7D9C40',
  fontSize: '20px',
}));

const GasTokenDropTitle = styled(Typography)(() => ({
  color: '#7D9C40',
}));

const GasTokenDropDescription = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '18px',
  color: '#000000',
}));

const BackButton = styled(Box)(() => ({
  position: 'absolute',
  top: '2rem',
  left: '2rem',
  zIndex: 2,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    opacity: 0.7,
  },
}));
