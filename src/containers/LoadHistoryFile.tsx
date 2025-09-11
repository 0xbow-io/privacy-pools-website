'use client';

import { useCallback, useState, useEffect } from 'react';
import { Button, Stack, styled, Typography } from '@mui/material';
import { BackButton } from '~/components';
import { SeedPhraseForm } from '~/containers/SeedPhraseForm';
import { useAuthContext, useGoTo, useAccountContext, useNotifications } from '~/hooks';
import { FOOTER_HEIGHT, ROUTER, verifyAndSanitizeSeedPhrase } from '~/utils';

export const LoadHistoryFile = () => {
  const goTo = useGoTo();
  const [seedPhrase, setSeedPhrase] = useState('');
  const { addNotification } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'wallet' | 'passkey' | 'manual'>('manual');
  const { loadAccount, setSeed } = useAccountContext();
  const { login } = useAuthContext();

  const handleSetSeedPhrase = (newSeedPhrase: string) => {
    if (newSeedPhrase === seedPhrase) return;

    setSeedPhrase(newSeedPhrase);
  };

  const handleLoad = useCallback(() => {
    if (!seedPhrase) return;

    let sanitizedSeedPhrase = seedPhrase;

    try {
      sanitizedSeedPhrase = verifyAndSanitizeSeedPhrase(seedPhrase);
    } catch (e) {
      console.error(e);
      addNotification('error', e instanceof Error ? e.message : 'Invalid recovery phrase');
      setSeedPhrase('');
      return;
    }

    setIsLoading(true);
    setSeed(sanitizedSeedPhrase);

    loadAccount(seedPhrase)
      .then(() => {
        // Track signup method for security purposes
        localStorage.setItem('signupMethod', 'manual');

        setIsLoading(false);
        login(seedPhrase);
      })
      .catch((e) => {
        console.error(e);
        addNotification('error', 'Failed to load account. Please try again.');
        setIsLoading(false);
      });
  }, [seedPhrase, loadAccount, login, addNotification, setSeed]);

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

  const handleMethodChange = (method: 'wallet' | 'passkey' | 'manual') => {
    setAuthMethod(method);
  };

  // Auto-load when wallet or passkey generates a seed phrase
  useEffect(() => {
    if ((authMethod === 'wallet' || authMethod === 'passkey') && seedPhrase) {
      handleLoad();
    }
  }, [authMethod, seedPhrase, handleLoad]);

  if (isLoading) {
    return (
      <Container>
        <Stack gap={2} zIndex={1}>
          <Typography variant='h5' fontWeight='bold' align='center'>
            Syncing
          </Typography>
          <Typography variant='body2' align='center'>
            We’re loading your data
          </Typography>
        </Stack>
        <Circle />
      </Container>
    );
  }

  return (
    <LoadHistoryFileContainer>
      <BackButton back={back} />

      <Stack gap={2} maxWidth='32rem'>
        <Typography variant='h5' fontWeight='bold' align='center'>
          Load your Account
        </Typography>
      </Stack>

      <SeedPhraseForm
        type='load'
        seedPhrase={seedPhrase}
        setSeedPhrase={handleSetSeedPhrase}
        onEnterKey={handleEnterKey}
        hideActions={authMethod === 'wallet' || authMethod === 'passkey'}
        onMethodChange={handleMethodChange}
      />

      {authMethod === 'manual' && seedPhrase && (
        <Button onClick={handleLoad} disabled={!seedPhrase} data-testid='load-account-button' fullWidth>
          Load Account
        </Button>
      )}
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
