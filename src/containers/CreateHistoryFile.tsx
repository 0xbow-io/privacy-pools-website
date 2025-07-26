'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, FormControlLabel, Link, Stack, styled, Typography, TextField, Box } from '@mui/material';
import { BackButton } from '~/components';
import { getConstants } from '~/config/constants';
import { SeedPhraseForm } from '~/containers';
import {
  useModal,
  usePoolAccountsContext,
  useAuthContext,
  useGoTo,
  useAccountContext,
  useChainContext,
  useEncryptedSeedContext,
  useNotifications,
} from '~/hooks';
import { EventType, ModalType } from '~/types';
import { generateSeedPhrase, ROUTER } from '~/utils';
import { encryptSeedPhrase } from '~/utils/seedPhrase';

const { TOC_URL } = getConstants();

export const CreateHistoryFile = () => {
  const goTo = useGoTo();
  const { setActionType } = usePoolAccountsContext();
  const { createAccount } = useAccountContext();
  const { maxDeposit } = useChainContext();
  const { login } = useAuthContext();
  const { setModalOpen } = useModal();
  const { setEncryptedSeed } = useEncryptedSeedContext();
  const { addNotification } = useNotifications();
  const [seedPhrase, setSeedPhrase] = useState('');
  const [encryptedBlob, setEncryptedBlob] = useState('');

  // Multi-step flow state
  const [step, setStep] = useState<'seedphrase' | 'password' | 'encrypted'>('seedphrase');

  const [isHistoryFileCreated, setIsHistoryFileCreated] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isBlobConfirmed, setIsBlobConfirmed] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addNotification('success', 'Copied to clipboard!');
    } catch {
      addNotification('error', 'Failed to copy to clipboard');
    }
  };

  const isDepositDisabled = !BigInt(maxDeposit);

  const handleCreateHistoryFile = () => {
    if (!isConfirmed || !isBlobConfirmed || !isVerified) return;

    createAccount(seedPhrase);

    // Save the encrypted seed to context for future use
    if (encryptedBlob) {
      setEncryptedSeed(encryptedBlob);
    }

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
    if (verified) {
      setStep('password');
    }
  };

  const handlePasswordSubmit = () => {
    if (!password.trim() || !confirmPassword.trim() || !seedPhrase) return;

    if (password.length < 6) {
      addNotification('error', 'Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      addNotification('error', 'Passwords do not match');
      return;
    }

    try {
      const encrypted = encryptSeedPhrase(seedPhrase, password);
      setEncryptedBlob(encrypted);
      setStep('encrypted');
    } catch (error) {
      console.error('Failed to encrypt seed phrase:', error);
      addNotification('error', 'Failed to encrypt seed phrase. Please try again.');
    }
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

  // Step 1: Seed phrase verification
  if (step === 'seedphrase') {
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
        </Stack>
      </CreateHistoryFileContainer>
    );
  }

  // Step 2: Password setting
  if (step === 'password') {
    return (
      <CreateHistoryFileContainer>
        <BackButton back={() => setStep('seedphrase')} />
        <Stack gap={2} maxWidth='32rem'>
          <Typography variant='h5' fontWeight='bold' align='center'>
            Set Encryption Password
          </Typography>
          <Typography variant='body1' align='center'>
            Choose a strong password to encrypt your seed phrase. You&apos;ll need this password to log in later.
          </Typography>
        </Stack>

        <Stack gap={2} width='100%' alignItems='center' maxWidth='400px'>
          <TextField
            label='Encryption Password'
            type='password'
            variant='outlined'
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Enter a strong password...'
            slotProps={{
              htmlInput: {
                autoComplete: 'new-password',
                autoCorrect: 'off',
                autoCapitalize: 'off',
                spellCheck: false,
              },
            }}
            error={Boolean(password && password.length < 6)}
            helperText={password && password.length < 6 ? 'Password must be at least 6 characters' : ''}
          />
          <TextField
            label='Confirm Password'
            type='password'
            variant='outlined'
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                password.trim() &&
                confirmPassword.trim() &&
                password.length >= 6 &&
                password === confirmPassword
              ) {
                handlePasswordSubmit();
              }
            }}
            placeholder='Confirm your password...'
            slotProps={{
              htmlInput: {
                autoComplete: 'new-password',
                autoCorrect: 'off',
                autoCapitalize: 'off',
                spellCheck: false,
              },
            }}
            error={Boolean(confirmPassword && password !== confirmPassword)}
            helperText={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : ''}
          />
          <Button
            onClick={handlePasswordSubmit}
            disabled={
              !password.trim() || !confirmPassword.trim() || password.length < 6 || password !== confirmPassword
            }
            variant='contained'
            fullWidth
          >
            Generate Login Key
          </Button>
        </Stack>
      </CreateHistoryFileContainer>
    );
  }

  // Step 3: Show encrypted blob and complete creation
  return (
    <CreateHistoryFileContainer>
      <BackButton back={() => setStep('password')} />
      <Stack gap={2} maxWidth='32rem'>
        <Typography variant='h5' fontWeight='bold' align='center'>
          Save Your Login Key
        </Typography>
        <Typography variant='body1' align='center'>
          Copy and save this login key safely. You&apos;ll need it to log in later.
        </Typography>
      </Stack>

      <Box sx={{ width: '100%', maxWidth: '500px' }}>
        <TextField
          label='Login Key'
          variant='outlined'
          fullWidth
          multiline
          minRows={6}
          maxRows={8}
          value={encryptedBlob}
          slotProps={{
            htmlInput: {
              readOnly: true,
              style: {
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
              },
            },
          }}
          sx={{
            mb: 1,
            '& .MuiInputBase-input': {
              cursor: 'text',
              userSelect: 'all',
            },
          }}
          helperText="Copy this login key and store it safely. You'll need it to log in later. If you lose it or forget your password, you'll need your seed phrase to access your account."
        />
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button variant='outlined' onClick={() => copyToClipboard(encryptedBlob)} sx={{ textTransform: 'none' }}>
            Copy Login Key
          </Button>
        </Box>
      </Box>

      <Stack gap={1} width='100%' alignItems='center' maxWidth='400px'>
        <SFormControlLabel
          control={<Checkbox checked={isConfirmed} onChange={() => setIsConfirmed(!isConfirmed)} />}
          label="I've backed up my Recovery Phrase somewhere offline and secure"
          data-testid='save-recovery-phrase'
          sx={{ fontSize: '1rem' }}
        />
        <SFormControlLabel
          control={<Checkbox checked={isBlobConfirmed} onChange={() => setIsBlobConfirmed(!isBlobConfirmed)} />}
          label="I've saved my Login Key safely"
          data-testid='save-encrypted-blob'
          sx={{ fontSize: '1rem' }}
        />
        <Typography variant='caption' textAlign='center' maxWidth='32rem'>
          By creating an account, you agree to our{' '}
          <Link href={TOC_URL} target='_blank'>
            Privacy Policy & Terms of Use
          </Link>
          .
        </Typography>
      </Stack>

      <Button
        onClick={handleCreateHistoryFile}
        disabled={!isConfirmed || !isBlobConfirmed}
        data-testid='create-account-button'
        fullWidth
      >
        Create
      </Button>
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
