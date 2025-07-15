'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { FormControl, MenuItem, Select, styled, SelectChangeEvent } from '@mui/material';
import { ChainAssets } from '~/config';
import { useChainContext } from '~/hooks/context/useChainContext';

export interface Option {
  value: ChainAssets;
  label: string;
}

const ALL_TOKEN_OPTIONS: Option[] = [
  { value: 'ETH', label: 'ETH' },
  { value: 'USDS', label: 'USDS' },
];

const MENU_STYLING = {
  MenuListProps: {
    sx: {
      '& .MuiMenuItem-root': {
        padding: '1.2rem 0rem',
      },
    },
  },
};

export const AssetSelect: React.FC = () => {
  const { selectedAsset, setSelectedAsset, chain } = useChainContext();

  const supportedAssets = useMemo(() => {
    return [...new Set(chain.poolInfo.map((pool) => pool.asset))];
  }, [chain.poolInfo]);

  const filteredTokenOptions = useMemo(() => {
    return ALL_TOKEN_OPTIONS.filter((option) => supportedAssets.includes(option.value));
  }, [supportedAssets]);

  const getAssetIcon = (asset: ChainAssets) => {
    const poolWithAsset = chain.poolInfo.find((pool) => pool.asset === asset);
    return poolWithAsset?.icon ? (
      <Image src={poolWithAsset.icon} alt={asset} width={20} height={20} style={{ width: '100%', height: '100%' }} />
    ) : null;
  };

  const tokenOptions = filteredTokenOptions;

  const handleChange = (event: SelectChangeEvent<unknown>) => {
    setSelectedAsset(event.target.value as ChainAssets);
  };

  return (
    <FormControl fullWidth>
      <StyledSelect value={selectedAsset} onChange={handleChange} variant='outlined' MenuProps={MENU_STYLING}>
        {tokenOptions?.map((option) => {
          const icon = getAssetIcon(option.value);
          return (
            <MenuItem key={option.value} value={option.value}>
              <MenuItemContent>
                {icon && <IconWrapper>{icon}</IconWrapper>}
                <span>{option.label}</span>
              </MenuItemContent>
            </MenuItem>
          );
        })}
      </StyledSelect>
    </FormControl>
  );
};

const StyledSelect = styled(Select)(() => {
  return {
    // FYI: This is the expected height of the Select component extracted from FIGMA, we can change if it is not appropriate
    height: '3.8rem',
    fontWeight: 500,
  };
});

const MenuItemContent = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  width: '100%',
}));

const IconWrapper = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.4rem',
  height: '1.4rem',
  '& > svg': {
    width: '100%',
    height: '100%',
  },
}));
