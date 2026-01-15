'use client';

import { MouseEvent, useRef, useState } from 'react';
import Image from 'next/image';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Box, Checkbox, Menu as MuiMenu, MenuItem, styled, Typography } from '@mui/material';
import { zIndex } from '~/utils';

interface ChainOption {
  chainId: number;
  name: string;
  icon: string;
}

interface ChainFilterSelectProps {
  chains: ChainOption[];
  selectedChainIds: number[];
  onChange: (chainIds: number[]) => void;
}

export const ChainFilterSelect = ({ chains, selectedChainIds, onChange }: ChainFilterSelectProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const allSelected = selectedChainIds.length === 0 || selectedChainIds.length === chains.length;

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
    // Toggle all chains - if all selected, keep all; if some selected, select all
    onChange([]);
  };

  const handleChainClick = (chainId: number) => {
    if (allSelected) {
      // If "All Chains" is selected, clicking one chain selects only that chain
      onChange([chainId]);
    } else if (selectedChainIds.includes(chainId)) {
      // Deselect this chain
      const newSelection = selectedChainIds.filter((id) => id !== chainId);
      // If no chains left, select all
      if (newSelection.length === 0) {
        onChange([]);
      } else {
        onChange(newSelection);
      }
    } else {
      // Select this chain
      const newSelection = [...selectedChainIds, chainId];
      // If all chains selected, switch to "All Chains" mode
      if (newSelection.length === chains.length) {
        onChange([]);
      } else {
        onChange(newSelection);
      }
    }
  };

  const getDisplayText = () => {
    if (allSelected) {
      return 'All Chains';
    }
    if (selectedChainIds.length === 1) {
      const chain = chains.find((c) => c.chainId === selectedChainIds[0]);
      return chain?.name || 'Chain';
    }
    return `${selectedChainIds.length} Chains`;
  };

  return (
    <>
      <FilterButton ref={buttonRef} onClick={handleToggle} open={open}>
        <Typography variant='body2' sx={{ fontSize: '12px', fontWeight: 400 }}>
          {getDisplayText()}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{
            fontSize: '20px',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </FilterButton>

      <SMenu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        elevation={0}
      >
        <SMenuItem onClick={handleAllChainsClick}>
          <Checkbox checked={allSelected} size='small' sx={{ padding: 0, marginRight: 1 }} />
          <Typography variant='body2' sx={{ fontWeight: allSelected ? 600 : 400 }}>
            All Chains
          </Typography>
        </SMenuItem>

        {chains.map((chain) => {
          const isSelected = allSelected || selectedChainIds.includes(chain.chainId);
          return (
            <SMenuItem key={chain.chainId} onClick={() => handleChainClick(chain.chainId)}>
              <Checkbox checked={isSelected} size='small' sx={{ padding: 0, marginRight: 1 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Image src={chain.icon} alt={chain.name} width={20} height={20} />
                <Typography variant='body2' sx={{ fontWeight: isSelected && !allSelected ? 600 : 400 }}>
                  {chain.name}
                </Typography>
              </Box>
            </SMenuItem>
          );
        })}
      </SMenu>
    </>
  );
};

const FilterButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open: boolean }>(({ theme, open }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 12px',
  backgroundColor: theme.palette.background.paper,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: theme.palette.text.primary,
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
  },
  ...(open && {
    backgroundColor: theme.palette.grey[100],
  }),
}));

const SMenu = styled(MuiMenu)(({ theme }) => ({
  zIndex: zIndex.HEADER + 1,
  marginTop: '4px',
  '& .MuiPaper-root': {
    borderRadius: '8px',
    border: `1px solid ${theme.palette.grey[300]}`,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
    minWidth: '180px',
  },
  '& .MuiList-root': {
    padding: '8px',
  },
}));

const SMenuItem = styled(MenuItem)(() => ({
  padding: '8px 12px',
  borderRadius: '4px',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
}));
