'use client';

import { MouseEvent, useRef, useState } from 'react';
import { Checkmark, Copy, Logout, Menu as MenuIcon, Wallet } from '@carbon/icons-react';
import {
  ListItemIcon,
  Menu as MuiMenu,
  MenuItem,
  Stack,
  styled,
  Typography,
  IconButton,
  useTheme,
} from '@mui/material';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { useGoTo, useChainContext, useAuthContext } from '~/hooks';
import { formatDataNumber, getUsdBalance, ROUTER, truncateAddress, zIndex } from '~/utils';

export const Menu = () => {
  const { address } = useAccount();
  const {
    price,
    balanceBN: { value, symbol, decimals },
  } = useChainContext();
  const { logout } = useAuthContext();
  const [copied, setCopied] = useState(false);
  const theme = useTheme();

  const ethBalanceBN = value.toString() ?? '0';
  const balance = formatDataNumber(ethBalanceBN, decimals, 2, false, false, false);
  const usdBalance = getUsdBalance(price, formatUnits(value, decimals), decimals);

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
    navigator.clipboard
      .writeText(address!)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1400);
      })
      .catch((error) => {
        // Don't report clipboard permission denials to Sentry - this is expected user behavior
        if (error.name === 'NotAllowedError') {
          console.warn('Clipboard permission denied by user');
          return;
        }
        // Report other clipboard errors
        throw error;
      });
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
          <BalanceUsd variant='body2'>{`~ ${usdBalance}`}</BalanceUsd>
        </Stack>

        <SMenuItem onClick={handleCopyAddress}>
          <ListItemIcon>
            <Wallet size={16} />
          </ListItemIcon>
          {truncateAddress(address!)}

          {copied ? (
            <Checkmark size={16} color={theme.palette.text.disabled} />
          ) : (
            <Copy size={16} color={theme.palette.text.disabled} />
          )}
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
