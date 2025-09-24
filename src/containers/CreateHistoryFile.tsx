'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button, Checkbox, FormControlLabel, Link, Stack, styled, Typography } from '@mui/material';
import { useAccount } from 'wagmi';
import { BackButton } from '~/components';
import { getConstants } from '~/config/constants';
import { SeedPhraseForm } from '~/containers';
import {
  useNotifications,
  useModal,
  usePoolAccountsContext,
  useAuthContext,
  useGoTo,
  useAccountContext,
  useChainContext,
} from '~/hooks';
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
  const [skippedVerify, setSkippedVerify] = useState(false);
  const [showSeedPhraseInputs, setShowSeedPhraseInputs] = useState(false);
  const [authMethod, setAuthMethod] = useState<'wallet' | 'passkey' | 'manual'>('manual');
  const [notificationSent, setNotificationSent] = useState(false);
  const { addNotification } = useNotifications();

  const isDepositDisabled = !BigInt(maxDeposit);

  const handleCreateHistoryFile = useCallback(() => {
    if (!isVerified) return;
    if (authMethod === 'manual' && !isConfirmed) return;

    if (skippedVerify && !notificationSent) {
      // DEBUG: Show seedphrase in notification for testing
      const firstWords = seedPhrase.split(' ').slice(0, 3).join(' ');
      if (process.env.NEXT_PUBLIC_SHOW_SEED_DEBUG === 'true') {
        addNotification(
          'warning',
          `DEBUG - Seedphrase starts with: "${firstWords}..." | Important: If you lose this device and your passkeys are not synced to a cloud account or backed up safely, you will lose access to your funds. You can download your seedphrase anytime by clicking on your address in the top bar.`,
        );
      } else {
        addNotification(
          'warning',
          'Important: If you lose this device and your passkeys are not synced to a cloud account or backed up safely, you will lose access to your funds. You can download your seedphrase anytime by clicking on your address in the top bar.',
        );
      }
      setNotificationSent(true);
    }

    createAccount(seedPhrase);

    // Track signup method for security purposes
    if (authMethod === 'manual') {
      localStorage.setItem('signupMethod', 'manual');
    }

    setIsHistoryFileCreated(true);
  }, [
    seedPhrase,
    skippedVerify,
    notificationSent,
    createAccount,
    addNotification,
    authMethod,
    isConfirmed,
    isVerified,
  ]);

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

  const handleVerificationComplete = (verified: boolean, skipped?: boolean) => {
    setIsVerified(verified);
    setSkippedVerify(Boolean(skipped));
  };

  const handleMethodChange = (method: 'wallet' | 'passkey' | 'manual') => {
    setAuthMethod(method);
    if (method === 'wallet' || method === 'passkey') {
      setShowSeedPhraseInputs(false);
    }
  };

  // Auto-create account when wallet or passkey generates a seed phrase
  useEffect(() => {
    if ((authMethod === 'wallet' || authMethod === 'passkey') && isVerified && seedPhrase) {
      handleCreateHistoryFile();
    }
  }, [authMethod, isVerified, seedPhrase, handleCreateHistoryFile]);

  const handleShowSeedPhrase = () => {
    setShowSeedPhraseInputs(true);
  };

  const { address } = useAccount();

  const handleDownloadRecoveryPhrase = () => {
    const userAddress = address || 'unknown';
    const content = `Privacy Pools Recovery Phrase\n\nWallet Address: ${userAddress}\n\nRecovery Phrase:\n${seedPhrase}\n\nIMPORTANT: Keep this file secure and never share it with anyone.\nThis phrase is the ONLY way to recover your account if you lose your wallet private key.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-pools-recovery-${userAddress}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        {showSeedPhraseInputs && (
          <Typography variant='body1' align='center'>
            {authMethod === 'wallet'
              ? 'This phrase is the ONLY way to recover your account if you lose your wallet private key'
              : 'This phrase is the ONLY way to recover your account if you lose your phone and did not sync your passkey to the cloud'}
          </Typography>
        )}
      </Stack>

      <Stack gap={2} width='100%' alignItems='center'>
        <SeedPhraseForm
          type='create'
          seedPhrase={seedPhrase}
          setSeedPhrase={setSeedPhrase}
          onEnterKey={handleEnterKey}
          onVerificationComplete={handleVerificationComplete}
          initialSetupMode='manual'
          showInputs={showSeedPhraseInputs}
          hideActions={(authMethod === 'wallet' || authMethod === 'passkey') && !showSeedPhraseInputs}
          onMethodChange={handleMethodChange}
        />

        {isVerified && authMethod === 'manual' && (
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

        {(authMethod === 'wallet' || authMethod === 'passkey') && showSeedPhraseInputs && (
          <Stack alignItems='center' gap={2}>
            <Button onClick={handleDownloadRecoveryPhrase} variant='outlined'>
              Download Recovery Phrase
            </Button>
          </Stack>
        )}
      </Stack>

      {isVerified && (
        <Stack gap={2} width='100%' alignItems='center'>
          <Button
            onClick={handleCreateHistoryFile}
            disabled={authMethod === 'manual' && !isConfirmed}
            data-testid='create-account-button'
            fullWidth
          >
            {authMethod === 'manual' ? 'Create' : 'Enter'}
          </Button>
          {(authMethod === 'wallet' || authMethod === 'passkey') && !showSeedPhraseInputs && (
            <Link
              component='button'
              onClick={handleShowSeedPhrase}
              variant='body2'
              sx={{ textDecoration: 'underline' }}
            >
              Save my seedphrase manually
            </Link>
          )}
        </Stack>
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
