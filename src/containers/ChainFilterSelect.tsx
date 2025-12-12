'use client';

import { MouseEvent, useRef, useState } from 'react';
import Image from 'next/image';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Popover, styled, Checkbox, Button, Box } from '@mui/material';
import { chainData } from '~/config';
import { zIndex } from '~/utils';

interface ChainFilterSelectProps {
  availableChainIds: number[];
  selectedChainIds: number[];
  onSelectionChange: (chainIds: number[]) => void;
}

export const ChainFilterSelect = ({
  availableChainIds,
  selectedChainIds,
  onSelectionChange,
}: ChainFilterSelectProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  const handleChainToggle = (chainId: number) => {
    if (selectedChainIds.includes(chainId)) {
      onSelectionChange(selectedChainIds.filter((id) => id !== chainId));
    } else {
      onSelectionChange([...selectedChainIds, chainId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedChainIds.length === availableChainIds.length) {
      // All selected, so deselect all (show all)
      onSelectionChange([]);
    } else {
      // Select all
      onSelectionChange([...availableChainIds]);
    }
  };

  // Determine display text
  const getDisplayText = () => {
    if (selectedChainIds.length === 0) {
      return 'All Chains';
    }
    if (selectedChainIds.length === 1) {
      const chain = chainData[selectedChainIds[0]];
      return chain?.name || 'Unknown';
    }
    return `${selectedChainIds.length} Chains`;
  };

  // "All Chains" is checked only when explicitly all chains are selected
  const isAllSelected = selectedChainIds.length === availableChainIds.length;
  const isChainSelected = (chainId: number) => {
    // When no chains are selected, all are shown but not checked
    if (selectedChainIds.length === 0) return false;
    return selectedChainIds.includes(chainId);
  };

  return (
    <>
      <FilterButton ref={buttonRef} open={open} onClick={handleToggle} endIcon={<KeyboardArrowDownIcon />}>
        {getDisplayText()}
      </FilterButton>

      <Popover
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 0 }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        elevation={0}
        sx={{ zIndex: zIndex.HEADER + 1, marginTop: '4px' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: '4px',
              border: '1px solid #ccc',
              boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
              minWidth: '160px',
              padding: '4px 0',
            },
          },
        }}
      >
        <DropdownItem onClick={handleSelectAll}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={selectedChainIds.length > 0 && selectedChainIds.length < availableChainIds.length}
            size='small'
            sx={{ padding: '4px', marginRight: '4px' }}
          />
          <span>All Chains</span>
        </DropdownItem>

        {availableChainIds.map((chainId) => {
          const chain = chainData[chainId];
          if (!chain) return null;

          return (
            <DropdownItem key={chainId} onClick={() => handleChainToggle(chainId)}>
              <Checkbox checked={isChainSelected(chainId)} size='small' sx={{ padding: '4px', marginRight: '4px' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', marginRight: '8px' }}>
                <Image src={chain.image} alt={chain.name} width={16} height={16} />
              </Box>
              <span>{chain.name}</span>
            </DropdownItem>
          );
        })}
      </Popover>
    </>
  );
};

const FilterButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open: boolean }>(({ open }) => ({
  color: '#000',
  backgroundColor: 'transparent',
  border: '1px solid #ccc',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '12px',
  fontWeight: 500,
  textTransform: 'none',
  minWidth: 'unset',
  height: '28px',
  '&:hover': {
    backgroundColor: '#f5f5f5',
    border: '1px solid #999',
    color: '#000',
  },
  ...(open && {
    backgroundColor: '#f5f5f5',
    border: '1px solid #999',
  }),
  '& .MuiButton-endIcon': {
    marginLeft: '4px',
    '& > svg': {
      fontSize: '16px',
      transition: 'transform 0.2s',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    },
  },
}));

const DropdownItem = styled('div')({
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px',
  fontSize: '13px',
  fontWeight: 400,
  minHeight: '36px',
  cursor: 'pointer',
  color: '#000',
  '&:hover': {
    backgroundColor: '#f5f5f5',
  },
});
