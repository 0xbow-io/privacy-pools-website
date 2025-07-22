'use client';

import { useState, useEffect } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Button, CircularProgress, Stack, styled, Switch, Typography } from '@mui/material';
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
  const { quoteState, setExtraGas } = useQuoteContext();

  // Quote logic for withdrawals
  const {
    balanceBN: { decimals },
    selectedPoolInfo,
    chainId,
  } = useChainContext();
  const { currentSelectedRelayerData, relayerData } = useExternalServices();
  const { addNotification } = useNotifications();

  // Helper function to determine if current asset is a stablecoin
  const isStablecoin = (assetSymbol: string): boolean => {
    return ['USDT', 'USDC', 'USDS', 'sUSDS', 'DAI'].includes(assetSymbol);
  };

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
          {actionType === EventType.WITHDRAWAL && isStablecoin(selectedPoolInfo?.asset || '') && (
            <GasTokenDropSection>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InfoIcon />
                  <Box>
                    <Typography variant='body1' fontWeight={600}>
                      Send Gas With Your Withdrawal
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      Get ETH for gas fees (1 swap + 1 transfer)
                    </Typography>
                  </Box>
                </Box>
                <GreenSwitch
                  checked={quoteState.extraGas}
                  onChange={(e) => setExtraGas(e.target.checked)}
                  disabled={isQuoteLoading}
                />
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
            {(isLoading || isConfirmClicked) && <CircularProgress size='1.6rem' />}
            {!isLoading &&
              !isConfirmClicked &&
              actionType === EventType.WITHDRAWAL &&
              !feeCommitment &&
              'Waiting for quote...'}
            {!isLoading && !isConfirmClicked && (actionType !== EventType.WITHDRAWAL || !!feeCommitment) && 'Confirm'}
          </SButton>
        )}
        <PoolAccountSection />

        <LinksSection />
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

const GreenSwitch = styled(Switch)(({ theme }) => ({
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: theme.palette.success.main,
    '&:hover': {
      backgroundColor: `${theme.palette.success.main}20`,
    },
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: theme.palette.success.main,
  },
}));

const GasTokenDropSection = styled(Box)(() => ({
  padding: '1rem 1.5rem',
  backgroundColor: '#e8f5e9',
  borderRadius: '8px',
  border: `1px solid #a5d6a7`,
  margin: '0.5rem 0',
  display: 'flex',
  alignItems: 'center',
}));

const InfoIcon = styled(InfoOutlinedIcon)(() => ({
  color: '#66bb6a',
  fontSize: '20px',
}));
