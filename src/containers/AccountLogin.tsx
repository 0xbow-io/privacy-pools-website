'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft } from '@carbon/icons-react';
import { Box, Typography, TextField, Button, styled, IconButton } from '@mui/material';
import { useEncryptedSeedContext, useAccountContext, useGoTo, useAuthContext, useNotifications } from '~/hooks';
import { ROUTER } from '~/utils';
import { decryptSeedPhrase } from '~/utils/seedPhrase';

export const AccountLogin = () => {
  const { encryptedSeed, setEncryptedSeed } = useEncryptedSeedContext();
  const { setSeed, loadAccount } = useAccountContext();
  const { login } = useAuthContext();
  const { addNotification } = useNotifications();
  const goTo = useGoTo();
  const [loginBlob, setLoginBlob] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate encrypted seed (aka login key) when encryptedSeed is available
  useEffect(() => {
    if (encryptedSeed) {
      setLoginBlob(encryptedSeed);
    }
  }, [encryptedSeed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Attempt to decrypt the seed phrase
      const seedPhrase: string = await decryptSeedPhrase(loginBlob, password);

      // Set the seed in account context
      setSeed(seedPhrase);

      // Save the encrypted seed for future use
      setEncryptedSeed(loginBlob);

      // Load the account
      await loadAccount(seedPhrase);

      // Login with the seed phrase
      login(seedPhrase);

      console.log('Login successful - seed phrase decrypted and account loaded');

      // Navigate to base/home page
      goTo(ROUTER.home.base);
    } catch (err) {
      console.error('Login failed:', err);
      if (err instanceof Error && err.message.includes('Invalid recovery phrase')) {
        setError('Invalid password or corrupted login key. Please check your credentials.');
      } else {
        setError('Failed to load account. Please try again.');
        addNotification('error', 'Failed to load account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SContainer>
      <SBackButton onClick={() => goTo(ROUTER.account.base)}>
        <ChevronLeft size={20} />
      </SBackButton>
      <Typography variant='h4' gutterBottom>
        Sign In to Privacy Pools
      </Typography>
      <Typography variant='body1' color='text.secondary' sx={{ mb: 3 }}>
        Enter your login key and password to access your privacy pool account.
      </Typography>

      {error && (
        <Typography variant='body2' color='error' sx={{ mb: 2, textAlign: 'center' }}>
          {error}
        </Typography>
      )}

      <SForm onSubmit={handleSubmit}>
        <TextField
          label='Login Key'
          variant='outlined'
          fullWidth
          multiline
          rows={4}
          value={loginBlob}
          onChange={(e) => setLoginBlob(e.target.value)}
          placeholder='Enter your login key data...'
          sx={{ mb: 2 }}
          disabled={isLoading}
        />

        <TextField
          label='Password'
          type='password'
          variant='outlined'
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder='Enter your password...'
          sx={{ mb: 3 }}
          disabled={isLoading}
          slotProps={{
            htmlInput: {
              autoComplete: 'off',
              autoCorrect: 'off',
              autoCapitalize: 'off',
              spellCheck: false,
            },
          }}
        />

        <Button
          type='submit'
          variant='contained'
          fullWidth
          size='large'
          disabled={!loginBlob || !password || isLoading}
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Button>
      </SForm>
    </SContainer>
  );
};

const SContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  padding: theme.spacing(4),
  paddingTop: theme.spacing(8), // Add more top padding for the back button
  textAlign: 'center',
  maxWidth: '500px',
  margin: '0 auto',
  position: 'relative',
}));

const SForm = styled('form')(() => ({
  width: '100%',
  maxWidth: '400px',
}));

const SBackButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  left: theme.spacing(1),
  color: theme.palette.text.primary,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));
