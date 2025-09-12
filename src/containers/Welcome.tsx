'use client';

import { useState } from 'react';
import { Button, Stack, styled, Typography, Divider, Link } from '@mui/material';
import { captureException } from '@sentry/nextjs';
import { useAccount, useSignTypedData } from 'wagmi';
import { CloseButton } from '~/components';
import { useGoTo, useModal, useAccountContext, useAuthContext, useNotifications } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER, deriveMnemonicFromWalletSignature } from '~/utils';

export const Welcome = () => {
  const goTo = useGoTo();
  const [isGenerating, setIsGenerating] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { setModalOpen } = useModal();
  const { createAccount, setSeed } = useAccountContext();
  const { login } = useAuthContext();
  const { addNotification } = useNotifications();

  const handleManualCreate = () => {
    goTo(ROUTER.account.children.create);
  };

  const handleManualLoad = () => {
    goTo(ROUTER.account.children.load);
  };

  const back = () => {
    goTo(ROUTER.home.base);
  };

  const handleGenerateWithWallet = async () => {
    try {
      if (!address) {
        setModalOpen(ModalType.CONNECT);
        return;
      }
      setIsGenerating(true);

      // Use EIP-712 typed data signature for all wallets
      const domain = { name: 'Privacy Pools', version: '1' } as const;
      const types = {
        DeriveSeed: [
          { name: 'action', type: 'string' },
          { name: 'context', type: 'string' },
        ],
      } as const;
      const message = { action: 'Derive Account Seed', context: 'privacy-pools/wallet-seed:v1' } as const;
      const signature = await signTypedDataAsync({ domain, types, primaryType: 'DeriveSeed', message });

      // Debug: Log signature details
      console.log('Wallet signature debug:');
      console.log('- Wallet address:', address);
      console.log('- Signature length:', signature.length);
      console.log('- Signature:', signature);

      const mnemonic = await deriveMnemonicFromWalletSignature(signature, address);

      // Create account and login
      createAccount(mnemonic);
      setSeed(mnemonic);

      // Track signup method for security purposes
      localStorage.setItem('signupMethod', 'wallet');

      if (!notificationSent) {
        // DEBUG: Show seedphrase in notification for testing
        const firstWords = mnemonic.split(' ').slice(0, 3).join(' ');
        addNotification(
          'warning',
          `DEBUG - Seedphrase starts with: "${firstWords}..." | Important: If you lose this device and your wallet is not backed up safely, you will lose access to your funds. You can download your seedphrase anytime by clicking on your address in the top bar.`,
        );
        setNotificationSent(true);
      }

      login(mnemonic);
    } catch (err) {
      console.error(err);
      captureException(err, { tags: { stage: 'generate_mnemonic_wallet' } });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <WelcomeContainer>
      <CloseButton back={back} />

      <Stack gap={3} maxWidth='32rem'>
        <Typography variant='h4' fontWeight='bold' align='center' data-testid='welcome-message'>
          Welcome to Privacy Pools
        </Typography>
      </Stack>

      <Stack alignItems='center' gap={2} sx={{ width: '100%' }}>
        <Button
          variant='contained'
          color='primary'
          onClick={handleGenerateWithWallet}
          disabled={isGenerating}
          fullWidth
          sx={{ maxWidth: '32rem' }}
        >
          Continue with Wallet
        </Button>
        <Divider sx={{ width: '100%', maxWidth: '32rem' }}>Or</Divider>

        <Stack direction='row' gap={2} sx={{ width: '100%', maxWidth: '32rem' }}>
          <Link
            component='button'
            onClick={handleManualCreate}
            variant='body2'
            sx={{
              textDecoration: 'underline',
              flex: 1,
              textAlign: 'center',
            }}
          >
            Manually setup a new account
          </Link>
          <Link
            component='button'
            onClick={handleManualLoad}
            variant='body2'
            sx={{
              textDecoration: 'underline',
              flex: 1,
              textAlign: 'center',
            }}
          >
            Manually load an account
          </Link>
        </Stack>
      </Stack>
    </WelcomeContainer>
  );
};

const WelcomeContainer = styled(Stack)(({ theme }) => ({
  gap: theme.spacing(6),
  height: '100%',
  maxWidth: '48rem',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '18rem',
  position: 'relative',

  [theme.breakpoints.down('sm')]: {
    position: 'inherit',
    marginTop: '6rem',
    maxWidth: '32rem',
  },
}));
