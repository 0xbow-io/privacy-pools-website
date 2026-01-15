'use client';

import { MouseEvent, useRef, useState } from 'react';
import Image from 'next/image';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Box, Checkbox, Menu as MuiMenu, MenuItem, styled, IconButton, Typography } from '@mui/material';
import { useChainContext } from '~/hooks';
import { zIndex } from '~/utils';
import starknetIcon from '~/assets/icons/starknet.svg';

export const ChainSelect = () => {
  const { allPoolsChains, selectedChainIds, setSelectedChainIds } = useChainContext();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const allSelected = selectedChainIds.length === 0 || selectedChainIds.length === allPoolsChains.length;

  const handleToggle = (event: MouseEvent<HTMLElement>) => {
    if (open) {
      handleClose();
    } else {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
    setTimeout(() => {
      buttonRef.current?.blur();
    }, 0);
  };

  const handleAllChainsClick = () => {
    setSelectedChainIds([]);
  };

  const handleChainClick = (chainId: number) => {
    if (allSelected) {
      // If "All Chains" is selected, clicking one chain selects only that chain
      setSelectedChainIds([chainId]);
    } else if (selectedChainIds.includes(chainId)) {
      // Deselect this chain
      const newSelection = selectedChainIds.filter((id) => id !== chainId);
      // If no chains left, select all
      if (newSelection.length === 0) {
        setSelectedChainIds([]);
      } else {
        setSelectedChainIds(newSelection);
      }
    } else {
      // Select this chain
      const newSelection = [...selectedChainIds, chainId];
      // If all chains selected, switch to "All Chains" mode
      if (newSelection.length === allPoolsChains.length) {
        setSelectedChainIds([]);
      } else {
        setSelectedChainIds(newSelection);
      }
    }
  };

  // Get the icon to display in the button
  const getButtonIcon = () => {
    if (allSelected || selectedChainIds.length !== 1) {
      // Show a generic chain icon or first chain's icon
      return allPoolsChains[0]?.icon || '';
    }
    // Show the selected chain's icon
    const selectedChain = allPoolsChains.find((c) => c.chainId === selectedChainIds[0]);
    return selectedChain?.icon || allPoolsChains[0]?.icon || '';
  };

  if (allPoolsChains.length === 0) {
    return null;
  }

  return (
    <>
      <SIconButton ref={buttonRef} open={open} onClick={handleToggle} data-testid='chain-select-button'>
        <Image src={getButtonIcon()} alt='chain' width={16} height={16} />
      </SIconButton>

      <SMenu
        anchorEl={anchorEl}
        id='chain-filter-menu'
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 0 }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        elevation={0}
      >
        <SMenuItem onClick={handleAllChainsClick}>
          <Checkbox checked={allSelected} size='small' sx={{ padding: 0, marginRight: 1 }} />
          <Typography variant='body2' sx={{ fontWeight: allSelected ? 600 : 400, fontSize: '1.6rem' }}>
            All Chains
          </Typography>
        </SMenuItem>

        {allPoolsChains.map((chain) => {
          const isSelected = allSelected || selectedChainIds.includes(chain.chainId);
          return (
            <SMenuItem key={chain.chainId} onClick={() => handleChainClick(chain.chainId)}>
              <Checkbox checked={isSelected} size='small' sx={{ padding: 0, marginRight: 1 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Image src={chain.icon} alt={chain.name} width={16} height={16} />
                <Typography
                  variant='body2'
                  sx={{ fontWeight: isSelected && !allSelected ? 600 : 400, fontSize: '1.6rem' }}
                >
                  {chain.name}
                </Typography>
              </Box>
            </SMenuItem>
          );
        })}

        <MenuItem
          component='a'
          href='https://starknet.privacypools.com'
          target='_blank'
          rel='noopener noreferrer'
          onClick={handleClose}
          sx={{
            padding: '1.6rem 0',
            fontSize: '1.6rem',
            fontWeight: 400,
            lineHeight: 'normal',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Image src={starknetIcon} alt='Starknet' width={16} height={16} />
            <Typography variant='body2' sx={{ fontWeight: 400, fontSize: '1.6rem' }}>
              Starknet
            </Typography>
            <OpenInNewIcon sx={{ fontSize: 14, ml: 'auto', opacity: 0.6 }} />
          </Box>
        </MenuItem>
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
      '& > img': {
        filter: 'invert(1)',
      },
    }),
    '&:hover, &:focus': {
      '& > img': {
        filter: 'invert(1)',
      },
    },
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

    [theme.breakpoints.down('sm')]: {
      marginTop: '1.5rem',
    },
  };
});

const SMenuItem = styled(MenuItem)(() => ({
  padding: '1.6rem 0',
  fontSize: '1.6rem',
  fontWeight: 400,
  lineHeight: 'normal',

  '.copy-icon': {
    marginLeft: 'auto',
  },
}));
