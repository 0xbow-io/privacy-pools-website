'use client';

import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Box, Button, TextField, Typography, styled, CircularProgress, Alert } from '@mui/material';
import { ModalType } from '~/types';
import { BaseModal } from './BaseModal';

interface NewsletterSubscriptionModalProps {
  siteKey?: string;
}

interface SubscriptionState {
  email: string;
  isLoading: boolean;
  error: string | null;
  success: boolean;
  turnstileToken: string | null;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NewsletterSubscriptionModal: React.FC<NewsletterSubscriptionModalProps> = ({
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
}) => {
  const [state, setState] = useState<SubscriptionState>({
    email: '',
    isLoading: false,
    error: null,
    success: false,
    turnstileToken: null,
  });

  const isValidEmail = (email: string): boolean => {
    return emailRegex.test(email);
  };

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setState((prev) => ({
      ...prev,
      email: event.target.value,
      error: null,
    }));
  };

  const handleTurnstileSuccess = (token: string) => {
    setState((prev) => ({
      ...prev,
      turnstileToken: token,
    }));
  };

  const handleTurnstileError = () => {
    setState((prev) => ({
      ...prev,
      turnstileToken: null,
      error: 'Captcha verification failed. Please try again.',
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isValidEmail(state.email)) {
      setState((prev) => ({ ...prev, error: 'Please enter a valid email address.' }));
      return;
    }

    if (!state.turnstileToken) {
      setState((prev) => ({ ...prev, error: 'Please complete the captcha verification.' }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/newsletter-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: state.email,
          'cf-turnstile-response': state.turnstileToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe to newsletter');
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        success: true,
        email: '',
        turnstileToken: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      }));
    }
  };

  const canSubmit = state.email && isValidEmail(state.email) && state.turnstileToken && !state.isLoading;

  if (state.success) {
    return (
      <BaseModal type={ModalType.NEWSLETTER_SUBSCRIPTION} size='small'>
        <ModalContent>
          <Typography variant='h4' component='h2' gutterBottom>
            🎉 Success!
          </Typography>
          <Typography variant='body1' color='text.secondary' textAlign='center' sx={{ mb: 3 }}>
            Thank you for subscribing to our newsletter! You&apos;ll receive the latest updates and product news
            directly in your inbox.
          </Typography>
        </ModalContent>
      </BaseModal>
    );
  }

  return (
    <BaseModal type={ModalType.NEWSLETTER_SUBSCRIPTION} size='small'>
      <ModalContent>
        <Typography variant='h4' component='h2' gutterBottom>
          Stay Updated
        </Typography>
        <Typography variant='body2' color='text.secondary' textAlign='center' sx={{ mb: 3 }}>
          Subscribe to our newsletter for the latest privacy pool updates, features, and security announcements.
        </Typography>

        <StyledForm onSubmit={handleSubmit}>
          <TextField
            type='email'
            label='Email Address'
            value={state.email}
            onChange={handleEmailChange}
            placeholder='Enter your email address'
            variant='outlined'
            fullWidth
            required
            error={!!state.error && state.error.includes('email')}
            helperText={state.error && state.error.includes('email') ? state.error : ''}
            sx={{ mb: 2 }}
          />

          {siteKey && (
            <TurnstileContainer>
              <Turnstile
                siteKey={siteKey}
                onSuccess={handleTurnstileSuccess}
                onError={handleTurnstileError}
                onExpire={() => setState((prev) => ({ ...prev, turnstileToken: null }))}
              />
            </TurnstileContainer>
          )}

          {state.error && !state.error.includes('email') && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {state.error}
            </Alert>
          )}

          <SubmitButton
            type='submit'
            variant='contained'
            fullWidth
            disabled={!canSubmit}
            startIcon={state.isLoading ? <CircularProgress size={16} color='inherit' /> : null}
          >
            {state.isLoading ? 'Subscribing...' : 'Subscribe'}
          </SubmitButton>

          <Typography variant='caption' color='text.secondary' textAlign='center' sx={{ mt: 2 }}>
            We respect your privacy. Unsubscribe at any time.
          </Typography>
        </StyledForm>
      </ModalContent>
    </BaseModal>
  );
};

const ModalContent = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '2rem',
  textAlign: 'center',
  minWidth: '400px',
  '@media (max-width: 480px)': {
    minWidth: '320px',
    padding: '1.5rem',
  },
}));

const StyledForm = styled('form')(() => ({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  maxWidth: '350px',
}));

const TurnstileContainer = styled(Box)(() => ({
  display: 'flex',
  justifyContent: 'center',
  marginBottom: '1rem',
  '& > div': {
    maxWidth: '100%',
  },
}));

const SubmitButton = styled(Button)(({ theme }) => ({
  height: '48px',
  fontSize: '1rem',
  fontWeight: 600,
  textTransform: 'none',
  backgroundColor: theme.palette.primary.main,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
  },
  '&:disabled': {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.action.disabled,
  },
}));
