'use client';

import { useState } from 'react';
import {
  Button,
  Stack,
  styled,
  Typography,
  Divider,
  Link,
  Alert,
  Checkbox,
  FormControlLabel,
  keyframes,
  CircularProgress,
} from '@mui/material';
import { captureException } from '@sentry/nextjs';
import { useAccount, useSignTypedData } from 'wagmi';
import { CloseButton } from '~/components';
import { useGoTo, useModal, useAccountContext, useAuthContext, useNotifications, useAccountType } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER, deriveMnemonicFromWalletSignature, buildSeedDerivationTypedData } from '~/utils';

export const Welcome = () => {
  const goTo = useGoTo();
  const [isGenerating, setIsGenerating] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [generatedVersion, setGeneratedVersion] = useState<'v1' | 'v2'>('v2');
  const [hasMnemonicDownloaded, setHasMnemonicDownloaded] = useState(false);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const { address, connector } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { setModalOpen } = useModal();
  const { setSeed, loadAccount } = useAccountContext();
  const { login } = useAuthContext();
  const { addNotification } = useNotifications();
  const { accountType, isSafeAccount } = useAccountType();

  // Check if current wallet is Coinbase Wallet
  const isCoinbaseWallet = connector?.id === 'coinbaseWalletSDK' || connector?.name?.toLowerCase().includes('coinbase');

  // Check if current wallet is a smart contract wallet (exclude MetaMask Smart Account which is EIP-7702 and can still sign)
  const isSmartContractWallet =
    accountType === 'Unknown Smart Contract' ||
    accountType === 'Unknown Smart Account' ||
    accountType === 'Safe Wallet' ||
    accountType === 'Safe App' ||
    isSafeAccount;

  // Check if wallet is connected via WalletConnect and if it's not in the whitelist
  const isWalletConnect = connector?.id === 'walletConnect';
  const walletName = connector?.name?.toLowerCase() || '';
  const whitelistedWalletConnectWallets = ['metamask', 'rabby', 'rainbow', 'family'];
  const isWhitelistedWalletConnect = whitelistedWalletConnectWallets.some((name) => walletName.includes(name));
  const isBlockedWalletConnect = isWalletConnect && !isWhitelistedWalletConnect;

  // Disable wallet-based generation for smart contract wallets, Coinbase Wallet, AND non-whitelisted WalletConnect
  const isWalletSigningDisabled = isSmartContractWallet || isCoinbaseWallet || isBlockedWalletConnect;

  const handleManualCreate = () => {
    goTo(ROUTER.account.children.create);
  };

  const handleManualLoad = () => {
    goTo(ROUTER.account.children.load);
  };

  const back = () => {
    goTo(ROUTER.home.base);
  };

  const handleGenerateWithWallet = async (version: 'v1' | 'v2' = 'v2') => {
    try {
      if (!address) {
        setModalOpen(ModalType.CONNECT);
        return;
      }
      setIsGenerating(true);

      // Use standardized EIP-712 payload that commits to addressHash
      const { domain, types, primaryType, message } = buildSeedDerivationTypedData(address, version);

      // SECURITY: Verify signature determinism by signing twice
      addNotification('info', 'Verifying wallet signature determinism (1/2)...');
      const signature1 = await signTypedDataAsync({ domain, types, primaryType, message });

      addNotification('info', 'Verifying wallet signature determinism (2/2)...');
      const signature2 = await signTypedDataAsync({ domain, types, primaryType, message });

      // Compare signatures to ensure determinism
      if (signature1 !== signature2) {
        addNotification(
          'error',
          'Your wallet produces non-deterministic signatures and cannot be used for key generation. Please use manual seedphrase setup instead.',
        );
        setIsGenerating(false);
        return;
      }

      // Debug: Log signature details (only in development with debug flag)
      if (process.env.NEXT_PUBLIC_SHOW_SEED_DEBUG === 'true') {
        console.log('Wallet signature debug:');
        console.log('- Wallet address:', address);
        console.log('- Signature length:', signature1.length);
        console.log('- Signature:', signature1);
        console.log('- Determinism verified: ✓');
      }

      const mnemonic = await deriveMnemonicFromWalletSignature(signature1, address, version);

      // Check if this wallet has already downloaded seedphrase before
      const previouslyDownloaded =
        localStorage.getItem('seedphraseDownloaded')?.toLowerCase() === address.toLowerCase();

      if (previouslyDownloaded) {
        // Skip download screen, proceed directly to account
        setIsGenerating(false);
        setIsLoadingAccount(true);
        try {
          await loadAccount(mnemonic);
          setSeed(mnemonic);
          localStorage.setItem('signupMethod', 'wallet');
          localStorage.setItem('walletSeedVersion', version);
          login(mnemonic);
        } catch (loadErr) {
          console.error(loadErr);
          captureException(loadErr, { tags: { stage: 'load_returning_wallet' } });
          addNotification('error', 'Failed to load account. Please try again.');
          setIsLoadingAccount(false);
        }
        return;
      }

      // Store generated mnemonic and version, then show download screen
      setGeneratedMnemonic(mnemonic);
      setGeneratedVersion(version);
      setIsGenerating(false);

      // Do NOT proceed until user downloads the seedphrase
    } catch (err) {
      console.error(err);
      captureException(err, { tags: { stage: 'generate_mnemonic_wallet' } });
      addNotification('error', 'Failed to generate key from wallet. Please try again or use manual setup.');
      setIsGenerating(false);
    }
  };

  const handleDownloadMnemonic = () => {
    if (!generatedMnemonic || !address) return;

    // Create downloadable text file
    const blob = new Blob([generatedMnemonic], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-pools-seedphrase-${address?.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Store that this wallet has downloaded seedphrase
    localStorage.setItem('seedphraseDownloaded', address.toLowerCase());

    setHasMnemonicDownloaded(true);
    addNotification('success', 'Seedphrase downloaded! Keep this file safe and secure.');
  };

  const handleProceedAfterDownload = async () => {
    if (!generatedMnemonic || !(hasMnemonicDownloaded || acknowledgedRisks)) return;

    setIsProceeding(true);
    try {
      // Load account (which will also create if new) to ensure existing pool accounts are loaded
      await loadAccount(generatedMnemonic);
      setSeed(generatedMnemonic);

      // Track signup method and version for security purposes
      localStorage.setItem('signupMethod', 'wallet');
      localStorage.setItem('walletSeedVersion', generatedVersion);

      if (!notificationSent) {
        addNotification(
          'warning',
          'IMPORTANT: Your Privacy Pools access depends on your wallet. If your wallet provider upgrades their signing method, you may lose access. Always keep your downloaded seedphrase safe!',
        );
        setNotificationSent(true);
      }

      login(generatedMnemonic);
    } catch (err) {
      console.error(err);
      captureException(err, { tags: { stage: 'load_generated_mnemonic' } });
      addNotification('error', 'Failed to load account. Please try again.');
      setIsProceeding(false);
    }
  };

  // Show download screen if mnemonic has been generated
  if (generatedMnemonic) {
    const handleCancel = () => {
      setGeneratedMnemonic(null);
      setGeneratedVersion('v2');
      setHasMnemonicDownloaded(false);
      setAcknowledgedRisks(false);
    };

    return (
      <WelcomeContainer>
        <CloseButton back={handleCancel} />

        <Stack gap={3} maxWidth='42rem' alignItems='center'>
          <Typography variant='h4' fontWeight='bold' align='center'>
            Download Your Seedphrase
          </Typography>

          <Alert severity='error' sx={{ width: '100%' }}>
            <Typography variant='body2' fontWeight='bold' gutterBottom>
              CRITICAL: Read This Carefully
            </Typography>
            <Typography variant='body2' component='div'>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '1.6rem' }}>
                <li>Your Privacy Pools access is tied to your wallet&apos;s signing method</li>
                <li>
                  If your wallet provider updates their software, changes security features, or you switch devices, you
                  may LOSE ACCESS
                </li>
                <li>This seedphrase is your ONLY backup to recover your funds</li>
                <li>You MUST download it before proceeding</li>
              </ul>
            </Typography>
          </Alert>

          <Alert severity='warning' sx={{ width: '100%', fontSize: '1.2rem' }}>
            <Typography variant='body2'>
              <strong>Never share your seedphrase with anyone.</strong> Anyone with access to it can steal your funds.
              Store it securely offline.
            </Typography>
          </Alert>

          <Stack gap={2} sx={{ width: '100%' }}>
            <Button
              variant='contained'
              color='primary'
              onClick={handleDownloadMnemonic}
              disabled={hasMnemonicDownloaded}
              fullWidth
            >
              {hasMnemonicDownloaded ? 'Seedphrase Downloaded ✓' : 'Download Seedphrase'}
            </Button>

            {!hasMnemonicDownloaded && (
              <>
                <Divider sx={{ my: 1 }}>Or</Divider>

                <FormControlLabel
                  control={
                    <Checkbox checked={acknowledgedRisks} onChange={(e) => setAcknowledgedRisks(e.target.checked)} />
                  }
                  label={
                    <Typography variant='body2' sx={{ fontSize: '1em' }}>
                      I understand the risks and will download my seedphrase later from the account menu (not
                      recommended) or I have already downloaded my seedphrase before
                    </Typography>
                  }
                  sx={{ position: 'relative', zIndex: 1 }}
                />
              </>
            )}

            <Button
              variant='contained'
              color='success'
              onClick={handleProceedAfterDownload}
              disabled={(!hasMnemonicDownloaded && !acknowledgedRisks) || isProceeding}
              fullWidth
              sx={{ py: 3 }}
            >
              {isProceeding ? (
                <>
                  Loading Account<AnimatedDots>...</AnimatedDots>
                </>
              ) : (
                'I Have Saved My Seedphrase - Continue'
              )}
            </Button>

            <Button variant='outlined' onClick={handleCancel} fullWidth>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </WelcomeContainer>
    );
  }

  return (
    <WelcomeContainer>
      <CloseButton back={back} />

      <Stack gap={3} maxWidth='42rem'>
        <Typography variant='h4' fontWeight='bold' align='center' data-testid='welcome-message'>
          Welcome to Privacy Pools
        </Typography>
      </Stack>

      <Stack alignItems='center' gap={2} sx={{ width: '100%' }}>
        {/* Warning about wallet dependency risks */}
        {address && !isWalletSigningDisabled && (
          <Alert severity='info' sx={{ width: '100%', maxWidth: '42rem' }}>
            <Typography variant='body2' fontWeight='bold' gutterBottom>
              Wallet-Based Key Generation (24-word seedphrase)
            </Typography>
            <Typography variant='body2' sx={{ fontSize: '1.5rem' }}>
              This convenience feature generates a secure 24-word seedphrase from your wallet signature with 256-bit
              entropy. However, if your wallet provider updates their signing method in the future, you may lose access.
              You will be required to download a backup seedphrase before proceeding.
            </Typography>
            <Typography variant='body2' sx={{ mt: 1, fontSize: '1.3rem', fontStyle: 'italic' }}>
              Note: If you have an existing account created with the legacy 12-word method, use &quot;Legacy wallet
              sign-in&quot; below.
            </Typography>
          </Alert>
        )}

        {isWalletSigningDisabled && address && (
          <Alert severity='warning' sx={{ width: '100%', maxWidth: '42rem' }}>
            {isBlockedWalletConnect
              ? 'This wallet connected via WalletConnect is not supported for wallet-based key generation. Please use MetaMask, Rabby, Rainbow, or Family wallet, or use manual seedphrase generation below.'
              : isCoinbaseWallet
                ? 'Coinbase Wallet does not support wallet-based key generation. Please use manual seedphrase generation below.'
                : 'Smart wallets do not support wallet-based key generation. Please use manual seedphrase generation below.'}
          </Alert>
        )}

        <Button
          variant='contained'
          color='primary'
          onClick={() => handleGenerateWithWallet()}
          disabled={isGenerating || isWalletSigningDisabled || isLoadingAccount}
          fullWidth
          sx={{ maxWidth: '42rem' }}
        >
          {isLoadingAccount ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} color='inherit' />
              Your Account Is Loading...
            </>
          ) : (
            'Continue with Wallet'
          )}
        </Button>
        <Divider sx={{ width: '100%', maxWidth: '42rem' }}>Or</Divider>

        <Stack direction='row' gap={2} sx={{ width: '100%', maxWidth: '42rem', flexWrap: 'wrap' }}>
          <Link
            component='button'
            onClick={handleManualCreate}
            variant='body2'
            sx={{
              textDecoration: 'underline',
              flex: 1,
              textAlign: 'center',
              minWidth: '120px',
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
              minWidth: '120px',
            }}
          >
            Manually load an account
          </Link>
          <Link
            component='button'
            onClick={() => handleGenerateWithWallet('v1')}
            disabled={isGenerating || isWalletSigningDisabled}
            variant='body2'
            sx={{
              textDecoration: 'underline',
              flex: 1,
              textAlign: 'center',
              minWidth: '120px',
            }}
          >
            Legacy wallet sign-in (12-word)
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
  marginTop: '8rem',
  position: 'relative',

  [theme.breakpoints.down('sm')]: {
    position: 'inherit',
    marginTop: '6rem',
    maxWidth: '32rem',
  },
}));

const dotsAnimation = keyframes`
  0%, 20% {
    content: '.';
  }
  40% {
    content: '..';
  }
  60%, 100% {
    content: '...';
  }
`;

const AnimatedDots = styled('span')({
  // Hide the static dots, show only animated ones
  visibility: 'hidden',
  position: 'relative',
  '&::after': {
    content: '"..."',
    animation: `${dotsAnimation} 1.5s infinite`,
    visibility: 'visible',
    position: 'absolute',
    left: 0,
  },
});
