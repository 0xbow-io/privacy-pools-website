'use client';

import { useCallback, useState } from 'react';
import { Button, Stack, styled, Typography, TextField, Box } from '@mui/material';
import { BackButton } from '~/components';
import { SeedPhraseForm } from '~/containers/SeedPhraseForm';
import { useAuthContext, useGoTo, useAccountContext, useNotifications, useEncryptedSeedContext } from '~/hooks';
import { FOOTER_HEIGHT, ROUTER, verifyAndSanitizeSeedPhrase } from '~/utils';
import { encryptSeedPhrase } from '~/utils/seedPhrase';

export const LoadHistoryFile = () => {
  const goTo = useGoTo();
  const [seedPhrase, setSeedPhrase] = useState('');
  const { addNotification } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const { loadAccount, setSeed } = useAccountContext();
  const { login } = useAuthContext();
  const { setEncryptedSeed } = useEncryptedSeedContext();

  // New state for the multi-step flow
  const [step, setStep] = useState<'seedphrase' | 'password' | 'encrypted'>('seedphrase');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [encryptedBlob, setEncryptedBlob] = useState('');
  const [sanitizedSeedPhrase, setSanitizedSeedPhrase] = useState('');

  const handleSetSeedPhrase = (newSeedPhrase: string) => {
    if (newSeedPhrase === seedPhrase) return;

    setSeedPhrase(newSeedPhrase);
  };

  const handleLoad = useCallback(() => {
    if (!seedPhrase) return;

    let validatedSeedPhrase = seedPhrase;

    try {
      validatedSeedPhrase = verifyAndSanitizeSeedPhrase(seedPhrase);
    } catch (e) {
      console.error(e);
      addNotification('error', e instanceof Error ? e.message : 'Invalid recovery phrase');
      setSeedPhrase('');
      return;
    }

    // Store the sanitized seed phrase and move to password step
    setSanitizedSeedPhrase(validatedSeedPhrase);
    setStep('password');
  }, [seedPhrase, addNotification]);

  const handlePasswordSubmit = useCallback(() => {
    if (!password.trim() || !confirmPassword.trim() || !sanitizedSeedPhrase) return;

    if (password.length < 6) {
      addNotification('error', 'Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      addNotification('error', 'Passwords do not match');
      return;
    }

    try {
      const encrypted = encryptSeedPhrase(sanitizedSeedPhrase, password);
      setEncryptedBlob(encrypted);
      setStep('encrypted');
    } catch (error) {
      console.error('Failed to encrypt seed phrase:', error);
      addNotification('error', 'Failed to encrypt seed phrase. Please try again.');
    }
  }, [password, confirmPassword, sanitizedSeedPhrase, addNotification]);

  const handleFinalSubmit = useCallback(() => {
    if (!sanitizedSeedPhrase) return;

    setIsLoading(true);
    setSeed(sanitizedSeedPhrase);

    // Save the encrypted seed to context
    if (encryptedBlob) {
      setEncryptedSeed(encryptedBlob);
    }

    loadAccount(sanitizedSeedPhrase)
      .then(() => {
        setIsLoading(false);
        login(sanitizedSeedPhrase);
        // Navigate to home after successful login
        goTo(ROUTER.home.base);
      })
      .catch((e) => {
        console.error(e);
        addNotification('error', 'Failed to load account. Please try again.');
        setIsLoading(false);
      });
  }, [sanitizedSeedPhrase, encryptedBlob, loadAccount, login, setSeed, setEncryptedSeed, addNotification, goTo]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard
      .writeText(encryptedBlob)
      .then(() => {
        addNotification('success', 'Login key copied to clipboard!');
      })
      .catch(() => {
        addNotification('error', 'Failed to copy to clipboard');
      });
  }, [encryptedBlob, addNotification]);

  const back = () => {
    goTo(ROUTER.account.base);
  };

  const handleEnterKey = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter') {
        handleLoad();
      }
    },
    [handleLoad],
  );

  if (isLoading) {
    return (
      <Container>
        <Stack gap={2} zIndex={1}>
          <Typography variant='h5' fontWeight='bold' align='center'>
            Syncing
          </Typography>
          <Typography variant='body2' align='center'>
            We&apos;re loading your data
          </Typography>
        </Stack>
        <Circle />
      </Container>
    );
  }

  // Step 1: Seed phrase input
  if (step === 'seedphrase') {
    return (
      <LoadHistoryFileContainer>
        <BackButton back={back} />

        <Stack gap={2} maxWidth='32rem'>
          <Typography variant='h5' fontWeight='bold' align='center'>
            Load your Account
          </Typography>
          <Typography variant='body1' align='center'>
            Enter your Recovery Phrase to load your account. You can paste it from your clipboard.
          </Typography>
        </Stack>

        <SeedPhraseForm
          type='load'
          seedPhrase={seedPhrase}
          setSeedPhrase={handleSetSeedPhrase}
          onEnterKey={handleEnterKey}
        />

        <Button onClick={handleLoad} disabled={!seedPhrase} data-testid='load-account-button' fullWidth>
          Continue
        </Button>
      </LoadHistoryFileContainer>
    );
  }

  // Step 2: Password input
  if (step === 'password') {
    return (
      <LoadHistoryFileContainer>
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
        </Stack>

        <Button
          onClick={handlePasswordSubmit}
          disabled={!password.trim() || !confirmPassword.trim() || password.length < 6 || password !== confirmPassword}
          variant='contained'
          fullWidth
        >
          Generate Login Key
        </Button>
      </LoadHistoryFileContainer>
    );
  }

  // Step 3: Show encrypted blob and complete login
  return (
    <LoadHistoryFileContainer>
      <BackButton back={() => setStep('password')} />

      <Stack gap={2} maxWidth='32rem'>
        <Typography variant='h5' fontWeight='bold' align='center'>
          Save Your Login Key
        </Typography>
        <Typography variant='body1' align='center'>
          Copy and save this login key safely. You can use it to log in faster next time.
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
                lineHeight: '1.2',
                wordBreak: 'break-all',
              },
            },
          }}
          sx={{
            mb: 2,
            '& .MuiInputBase-input': {
              cursor: 'text',
              userSelect: 'all',
            },
            '& .MuiInputBase-root': {
              fontSize: '0.75rem',
            },
          }}
          helperText="Copy this login key and store it safely. You'll need it to log in later. If you lose it or forget your password, you'll need your seed phrase to access your account."
        />

        <Button onClick={copyToClipboard} variant='outlined' fullWidth sx={{ mb: 2 }}>
          Copy to Clipboard
        </Button>
      </Box>

      <Button onClick={handleFinalSubmit} variant='contained' fullWidth data-testid='complete-load-button'>
        Complete Setup
      </Button>
    </LoadHistoryFileContainer>
  );
};

const LoadHistoryFileContainer = styled(Stack)(({ theme }) => ({
  gap: theme.spacing(6),
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

const Container = styled('div')(() => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: `calc(100vh - var(--header-height) - ${FOOTER_HEIGHT}rem)`,
  '@supports (height: 100dvh)': {
    height: '100%',
    minHeight: `calc(100dvh - var(--header-height) - ${FOOTER_HEIGHT}rem)`,
  },
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const Circle = styled('div')(({ theme }) => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  aspectRatio: '1',
  borderRadius: '50%',
  '--circle-width': '40%',
  width: 'var(--circle-width)',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.grey[50],
  animation: 'pulse 1.5s infinite',
  willChange: 'width',
  '@keyframes pulse': {
    '0%': {
      width: 'var(--circle-width)',
      animationTimingFunction: 'ease-out',
    },
    '50%': {
      width: 'calc(var(--circle-width) * 0.8)',
      animationTimingFunction: 'ease-in',
    },
    '100%': {
      width: 'var(--circle-width)',
    },
  },
  [theme.breakpoints.down('sm')]: {
    '--circle-width': '90%',
  },
}));
