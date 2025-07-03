'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, FormControlLabel, Link, Stack, styled, Typography } from '@mui/material';
import { BackButton } from '~/components';
import { getConstants } from '~/config/constants';
import { SeedPhraseForm } from '~/containers';
import { useModal, usePoolAccountsContext, useAuthContext, useGoTo, useAccountContext, useChainContext } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { generateSeedPhrase, ROUTER } from '~/utils';

const { TOC_URL } = getConstants();

export const CreateHistoryFile = () => {
  const goTo = useGoTo();
  const { setActionType } = usePoolAccountsContext();
  const { createAccount } = useAccountContext();
  const { maxDeposit } = useChainContext();
  const { login } = useAuthContext();
  const { setModalOpen } = useModal();
  const [seedPhrase, setSeedPhrase] = useState('');

  const [isHistoryFileCreated, setIsHistoryFileCreated] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const isDepositDisabled = !BigInt(maxDeposit);

  const isDepositDisabled = !BigInt(maxDeposit);

  const handleCreateHistoryFile = () => {
    if (!isConfirmed || !isVerified) return;

    createAccount(seedPhrase);
    setIsHistoryFileCreated(true);
  };

  const goToHome = () => {
    login();
  };

  const back = () => {
    goTo(ROUTER.account.base);
  };

  const goToDeposit = () => {
    goToHome();
    setActionType(EventType.DEPOSIT);
    setModalOpen(ModalType.DEPOSIT);
  };

  const handleEnterKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter') handleCreateHistoryFile();
  };

  const handleVerificationComplete = (verified: boolean) => {
    setIsVerified(verified);
  };

  useEffect(() => {
    setSeedPhrase(generateSeedPhrase());
  }, []);

  if (isHistoryFileCreated) {
    return (
      <WelcomeContainer>
        <Stack gap={3} maxWidth='32rem'>
          <Typography variant='h4' fontWeight='bold' align='center'>
            Welcome to Privacy Pools
          </Typography>
          <Stack gap={2}>
            <Typography variant='body2' align='center'>
              Let&apos;s start with your first deposit.
            </Typography>
            <Typography variant='body2' align='center'>
              Remember to keep your Recovery Phrase safe and never share it with anyone.
            </Typography>
          </Stack>
        </Stack>
        <Stack gap={2} flexDirection={['column', 'row']}>
          <Button onClick={goToDeposit} data-testid='deposit-button' disabled={isDepositDisabled}>
            Make a deposit
          </Button>
          <Button onClick={goToHome} data-testid='return-to-dashboard-button'>
            Go to Dashboard
          </Button>
        </Stack>
      </WelcomeContainer>
    );
  }

  return (
    <CreateHistoryFileContainer>
      <BackButton back={back} />
      <Stack gap={2} maxWidth='32rem'>
        <Typography variant='h5' fontWeight='bold' align='center'>
          Create an Account
        </Typography>
        <Typography variant='body1' align='center'>
          This phrase is the ONLY way to recover your account.
        </Typography>
      </Stack>

      <Stack gap={2} width='100%' alignItems='center'>
        <SeedPhraseForm
          type='create'
          seedPhrase={seedPhrase}
          setSeedPhrase={setSeedPhrase}
          onEnterKey={handleEnterKey}
          onVerificationComplete={handleVerificationComplete}
        />

        {isVerified && (
          <>
            <SFormControlLabel
              control={<Checkbox checked={isConfirmed} onChange={() => setIsConfirmed(!isConfirmed)} />}
              label="I've saved my Recovery Phrase"
              data-testid='save-recovery-phrase'
              sx={{ fontSize: '1rem' }}
            />
            <Typography variant='caption' textAlign='center' maxWidth='32rem'>
              By creating an account, you agree to our{' '}
              <Link href={TOC_URL} target='_blank'>
                Privacy Policy & Terms of Use
              </Link>
              .
            </Typography>
          </>
        )}
      </Stack>

      {isVerified && (
        <Button onClick={handleCreateHistoryFile} disabled={!isConfirmed} data-testid='create-account-button' fullWidth>
          Create
        </Button>
      )}
    </CreateHistoryFileContainer>
  );
};

const CreateHistoryFileContainer = styled(Stack)(({ theme }) => ({
  gap: theme.spacing(3),
  height: '100%',
  width: '48rem',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '8rem',
  position: 'relative',

  [theme.breakpoints.down('sm')]: {
    position: 'inherit',
    marginTop: '5rem',
    maxWidth: '32rem',
  },
}));

const WelcomeContainer = styled(Stack)(({ theme }) => ({
  gap: theme.spacing(6),
  height: '100%',
  maxWidth: '48rem',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '21rem',

  [theme.breakpoints.down('sm')]: {
    marginTop: '2rem',
    maxWidth: '32rem',
  },
}));

const SFormControlLabel = styled(FormControlLabel)(() => ({
  '& .MuiFormControlLabel-label': {
    fontSize: '1.4rem',
  },
}));
