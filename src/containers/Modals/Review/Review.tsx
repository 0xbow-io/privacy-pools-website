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
  const { actionType, amount, target, setFeeCommitment, setFeeBPSForWithdraw } = usePoolAccountsContext();
  const [isConfirmClicked, setIsConfirmClicked] = useState(false);
  const { quoteState, clearPendingQuoteRequest, clearCommitment } = useQuoteContext();

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
  const { isPriceCurrent, isPriceStale, canRequestQuote, requestNewQuote, commitQuote } = useRequestQuote({
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

  // For withdrawals, Confirm needs the price for the current amount and relayer
  // (phase 1). The signed commitment (phase 2) is fetched by the click itself.
  // For exits and deposits, no quote is involved.
  const isActionReady = actionType === EventType.WITHDRAWAL ? isPriceCurrent : true;
  const isConfirmDisabled =
    isLoading || isConfirmClicked || !isActionReady || (isQuoteLoading && actionType === EventType.WITHDRAWAL);

  // Request the price when pendingQuoteRequest is true (triggered by clicking
  // "Review Withdrawal"). This request carries no recipient, so the relayer
  // signs nothing and no clock runs while the user reads this step. The
  // commitment, which the proof binds via `withdrawalData` and which the
  // relayer rejects 60 s after signing, is requested on Confirm, right before
  // proving.
  useEffect(() => {
    if (actionType === EventType.WITHDRAWAL && canRequestQuote && quoteState.pendingQuoteRequest) {
      clearPendingQuoteRequest();

      // Only request a new price if the amount or relayer changed. A
      // commitment left over from an earlier Confirm is dropped either way;
      // the next Confirm fetches a fresh one.
      if (isPriceCurrent) {
        clearCommitment();
      } else {
        requestNewQuote();
      }
    }
  }, [
    actionType,
    canRequestQuote,
    quoteState.pendingQuoteRequest,
    clearPendingQuoteRequest,
    clearCommitment,
    requestNewQuote,
    isPriceCurrent,
  ]);

  const handleConfirm = useCallback(async () => {
    if (actionType === EventType.DEPOSIT) {
      setIsConfirmClicked(true);
      deposit();
    } else if (actionType === EventType.WITHDRAWAL) {
      if (!isPriceCurrent) {
        // The shown fee is not for the current amount or relayer: re-price
        // and let the user confirm again against the new number.
        await requestNewQuote();
        addNotification('warning', 'Quote refreshed. Please review and confirm.');
        return;
      }
      // Disables the button until this click resolves one way or the other.
      setIsConfirmClicked(true);
      try {
        const outcome = await commitQuote();
        if (outcome.kind === 'fee-increased') {
          // The relayer's fee moved above the shown one. The new fee is now on
          // screen and nothing was committed; the user confirms again.
          setIsConfirmClicked(false);
          addNotification('warning', 'The relayer fee went up. Please review the new fee and confirm.');
          return;
        }
        setFeeCommitment(outcome.feeCommitment);
        setFeeBPSForWithdraw(BigInt(outcome.price.feeBPS));
        // Open proof generation modal for withdrawals
        setModalOpen(ModalType.GENERATE_ZK_PROOF);
      } catch (err) {
        setIsConfirmClicked(false);
        console.error('commitQuote error:', err);
        addNotification('error', `Failed to get quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else if (actionType === EventType.EXIT) {
      setIsConfirmClicked(true);
      // Open proof generation modal for exits
      setModalOpen(ModalType.GENERATE_ZK_PROOF);
    }
  }, [
    actionType,
    isPriceCurrent,
    requestNewQuote,
    commitQuote,
    setFeeCommitment,
    setFeeBPSForWithdraw,
    addNotification,
    deposit,
    setModalOpen,
  ]);

  // One phase-1 request, on the user's click, restarting the freshness window.
  const handleRefreshPrice = async () => {
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

        <Stack direction='row' gap={2} justifyContent='center' flexWrap='wrap'>
          {/* The price's freshness window ran out. Refresh is one phase-1
              request on the user's click; the clock itself requests nothing.
              Confirm stays enabled: phase 2 re-prices and refuses a fee above
              the one shown, so an aged figure cannot lead to an overcharge. */}
          {actionType === EventType.WITHDRAWAL && isPriceStale && (
            <PulsingButton
              disabled={isQuoteLoading || isConfirmClicked}
              onClick={handleRefreshPrice}
              data-testid='refresh-price-button'
            >
              {isQuoteLoading && <CircularProgress size='1.6rem' sx={{ mr: 1 }} />}
              {isQuoteLoading ? 'Refreshing price...' : 'Refresh price'}
            </PulsingButton>
          )}
          <SButton disabled={isConfirmDisabled} onClick={handleConfirm} data-testid='confirm-review-button'>
            {(isLoading || isConfirmClicked || (isQuoteLoading && actionType === EventType.WITHDRAWAL)) && (
              <CircularProgress size='1.6rem' sx={{ mr: 1 }} />
            )}
            {!isLoading &&
              !isConfirmClicked &&
              actionType === EventType.WITHDRAWAL &&
              (isQuoteLoading || !isPriceCurrent) &&
              'Getting quote...'}
            {!isLoading &&
              !isConfirmClicked &&
              !isQuoteLoading &&
              (actionType !== EventType.WITHDRAWAL || isPriceCurrent) &&
              'Confirm'}
          </SButton>
        </Stack>
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
