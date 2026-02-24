'use client';

import { MouseEvent, useRef, useState } from 'react';
import { Checkmark, Copy, Download, Logout, Menu as MenuIcon, Wallet, Warning } from '@carbon/icons-react';
import {
  ListItemIcon,
  Menu as MuiMenu,
  MenuItem,
  Stack,
  styled,
  Typography,
  IconButton,
  useTheme,
  Avatar,
} from '@mui/material';
import { captureException } from '@sentry/nextjs';
import { formatUnits } from 'viem';
import { useSignTypedData, useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { useGoTo, useChainContext, useAuthContext, useAccountContext, useModal } from '~/hooks';
import { ModalType } from '~/types';
import {
  deriveMnemonicFromWalletSignature,
  buildSeedDerivationTypedData,
  formatDataNumber,
  getUsdBalance,
  ROUTER,
  truncateAddress,
  zIndex,
  useClipboard,
} from '~/utils';

export const Menu = () => {
  const { address } = useAccount();

  // ENS hooks for the connected user
  const { data: ensName } = useEnsName({
    address: address,
    chainId: 1, // Always use mainnet for ENS
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName || undefined,
    chainId: 1, // Always use mainnet for ENS
  });
  const {
    price,
    balanceBN: { value, symbol, decimals },
  } = useChainContext();
  const { logout } = useAuthContext();
  const { seed } = useAccountContext();
  const { setModalOpen } = useModal();
  const { copied, copyToClipboard } = useClipboard({ timeout: 1400 });
  const [isDownloading, setIsDownloading] = useState(false);
  const { signTypedDataAsync } = useSignTypedData();
  const theme = useTheme();

  // Get signup method and version from localStorage
  const signupMethod = typeof window !== 'undefined' ? localStorage.getItem('signupMethod') : null;
  const walletSeedVersion =
    typeof window !== 'undefined' ? (localStorage.getItem('walletSeedVersion') as 'v1' | 'v2' | null) : null;
  const canDownloadSeedphrase = signupMethod === 'wallet';

  const ethBalanceBN = value.toString() ?? '0';
  const balance = formatDataNumber(ethBalanceBN, decimals, 2, false, false, false);
  const usdBalance = price ? getUsdBalance(price, formatUnits(value, decimals), decimals) : null;

  const goTo = useGoTo();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (event: MouseEvent<HTMLElement>) => {
    if (event) {
      setAnchorEl(event.currentTarget);
    }
    if (open) {
      handleClose();
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
    setTimeout(() => {
      buttonRef.current?.blur();
    }, 0);
  };

  const handleLogout = () => {
    logout();
    goTo(ROUTER.home.base);
  };

  const handleCopyAddress = () => {
    if (address) {
      copyToClipboard(address);
    }
  };

  const handleDownloadSeedPhrase = async () => {
    if (!seed || !address) return;

    try {
      setIsDownloading(true);
      let mnemonic = '';

      if (signupMethod === 'wallet') {
        // Use stored version, or default to v1 for backward compatibility with users who signed in before version tracking
        const version: 'v1' | 'v2' = walletSeedVersion || 'v1';

        const { domain, types, primaryType, message } = buildSeedDerivationTypedData(address, version);
        const signature = await signTypedDataAsync({ domain, types, primaryType, message });

        // Debug: Log signature details (only in development with debug flag)
        if (process.env.NEXT_PUBLIC_SHOW_SEED_DEBUG === 'true') {
          console.log('Download signature debug:');
          console.log('- Wallet address:', address);
          console.log('- Signature length:', signature.length);
          console.log('- Signature:', signature);
        }

        mnemonic = await deriveMnemonicFromWalletSignature(signature, address!, version);
      }

      // Download the seedphrase
      const content = `Privacy Pools Recovery Phrase\n\nWallet Address: ${address}\n\nRecovery Phrase:\n${mnemonic}\n\nIMPORTANT: Keep this file secure and never share it with anyone.\nThis phrase is the ONLY way to recover your account if you lose access.`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-pools-recovery-${address}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      captureException(err, { tags: { stage: 'download_seedphrase' } });
    } finally {
      setIsDownloading(false);
    }

    handleClose();
  };

  return (
    <>
      <SIconButton ref={buttonRef} open={open} onClick={handleToggle} data-testid='account-menu-button'>
        <MenuIcon size={16} />
      </SIconButton>
      <SMenu
        anchorEl={anchorEl}
        id='account-menu'
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 0 }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        elevation={0}
      >
        <Stack direction='column' alignItems='start'>
          <EthText variant='h6'>
            {balance}
            <span>{symbol}</span>
          </EthText>
          {usdBalance && <BalanceUsd variant='body2'>{`~ ${usdBalance}`}</BalanceUsd>}
        </Stack>

        <SMenuItem onClick={handleCopyAddress}>
          <ListItemIcon>
            {ensAvatar ? <Avatar src={ensAvatar} sx={{ width: 16, height: 16 }} /> : <Wallet size={16} />}
          </ListItemIcon>
          {ensName || truncateAddress(address!)}

          {copied ? (
            <Checkmark size={16} color={theme.palette.text.disabled} />
          ) : (
            <Copy size={16} color={theme.palette.text.disabled} />
          )}
        </SMenuItem>

        {seed && canDownloadSeedphrase && (
          <SMenuItem onClick={handleDownloadSeedPhrase} disabled={isDownloading}>
            <ListItemIcon>
              <Download size={16} />
            </ListItemIcon>
            {isDownloading ? 'Authenticating...' : 'Download Recovery Phrase'}
          </SMenuItem>
        )}

        <SMenuItem
          onClick={() => {
            handleClose();
            setModalOpen(ModalType.SELF_REPORT);
          }}
        >
          <ListItemIcon>
            <Warning size={16} />
          </ListItemIcon>
          Report Compromised Address
        </SMenuItem>

        <SMenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout size={16} />
          </ListItemIcon>
          Logout
        </SMenuItem>
      </SMenu>
    </>
  );
};

const SIconButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open: boolean }>(({ theme, open }) => {
  return {
    color: theme.palette.text.primary,
    ...(open && {
      border: theme.palette.border.main,
      color: theme.palette.primary.contrastText,
      backgroundColor: theme.palette.text.primary,
    }),
  };
});

const SMenu = styled(MuiMenu)(({ theme }) => {
  return {
    zIndex: zIndex.HEADER + 1,
    marginTop: '1.5rem',
    '.MuiList-root.MuiList-padding.MuiMenu-list': {
      marginTop: '0rem',
    },
    '& .MuiListItemIcon-root': {
      color: theme.palette.text.primary,
    },
    '& .MuiList-root': {
      borderRadius: '0',
      padding: '0.8rem 2.4rem',
      minWidth: '30rem',
      border: '1px solid',
      borderColor: theme.palette.grey[900],
    },
    '& .MuiButtonBase-root:hover': {
      background: 'unset',
    },
    '& .Mui-disabled': {
      opacity: '1',
    },
  };
});

const SMenuItem = styled(MenuItem)(() => ({
  padding: '1.6rem 0',
  fontSize: '1.6rem',
  fontWeight: 400,
  lineHeight: 'normal',

  '& svg:not(:first-child)': {
    marginLeft: 'auto',
  },
}));

const EthText = styled(Typography)({
  fontWeight: 300,
  fontSize: '2.4rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  span: {
    fontSize: '1.6rem',
    marginLeft: '0.4rem',
  },
});

const BalanceUsd = styled(Typography)({
  fontWeight: 300,
  fontSize: '1.2rem',
});
