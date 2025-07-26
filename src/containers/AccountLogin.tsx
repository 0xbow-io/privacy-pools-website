'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, styled } from '@mui/material';
import { useEncryptedSeedContext, useAccountContext } from '~/hooks';
import { decryptSeedPhrase } from '~/utils/seedPhrase';

export const AccountLogin = () => {
  const { encryptedSeed, setEncryptedSeed } = useEncryptedSeedContext();
  const { setSeed } = useAccountContext();
  const [loginBlob, setLoginBlob] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate loginBlob when encryptedSeed is available
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

      // If decryption succeeds, set the seed in account context
      setSeed(seedPhrase);

      // Save the encrypted seed for future use
      setEncryptedSeed(loginBlob);

      console.log('Login successful - seed phrase decrypted and set');
      // TODO: route
    } catch (err) {
      console.error('Decryption failed:', err);
      setError('Invalid password or corrupted login blob. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SContainer>
      <Typography variant='h4' gutterBottom>
        Sign In to Privacy Pools
      </Typography>
      <Typography variant='body1' color='text.secondary' sx={{ mb: 3 }}>
        Enter your encrypted seed and password to access your privacy pool account.
      </Typography>

      {error && (
        <Typography variant='body2' color='error' sx={{ mb: 2, textAlign: 'center' }}>
          {error}
        </Typography>
      )}

      <SForm onSubmit={handleSubmit}>
        <TextField
          label='Login Blob (Encrypted Seed)'
          variant='outlined'
          fullWidth
          multiline
          rows={4}
          value={loginBlob}
          onChange={(e) => setLoginBlob(e.target.value)}
          placeholder='Enter your encrypted seed data...'
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
  textAlign: 'center',
  maxWidth: '500px',
  margin: '0 auto',
}));

const SForm = styled('form')(() => ({
  width: '100%',
  maxWidth: '400px',
}));
