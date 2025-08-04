'use client';

import Image from 'next/image';
import { Autocomplete, TextField, styled } from '@mui/material';
import { ChainAssets } from '~/config';
import { useChainContext } from '~/hooks/context/useChainContext';

export interface Option {
  value: ChainAssets;
  label: string;
}

const ALL_TOKEN_OPTIONS: Option[] = [
  { value: 'ETH', label: 'ETH' },
  { value: 'wstETH', label: 'wstETH' },
  { value: 'wBTC', label: 'wBTC' },
  { value: 'USDC', label: 'USDC' },
  { value: 'USDT', label: 'USDT' },
  { value: 'USDS', label: 'USDS' },
  { value: 'sUSDS', label: 'sUSDS' },
  { value: 'DAI', label: 'DAI' },
];

export const AssetSelect: React.FC = () => {
  const { selectedAsset, setSelectedAsset, chain } = useChainContext();
  const supportedAssets_new = [...new Set(chain.poolInfo.map((pool) => pool.asset))];

  const filteredTokenOptions_new = ALL_TOKEN_OPTIONS.filter((option) => supportedAssets_new.includes(option.value));

  const getAssetIcon_new = (asset: ChainAssets) => {
    const poolWithAsset = chain.poolInfo.find((pool) => pool.asset === asset);
    return poolWithAsset?.icon ? (
      <Image src={poolWithAsset.icon} alt={asset} width={20} height={20} style={{ width: '100%', height: '100%' }} />
    ) : null;
  };

  const handleChange_new = (_event: React.SyntheticEvent, newValue: Option | null) => {
    if (newValue) {
      setSelectedAsset(newValue.value);
    }
  };
  const selectedOption_new = filteredTokenOptions_new.find((option) => option.value === selectedAsset) || undefined;

  return (
    <StyledAutocomplete
      fullWidth
      value={selectedOption_new}
      onChange={handleChange_new}
      options={filteredTokenOptions_new}
      getOptionLabel={(option) => option.label}
      renderOption={(props, option) => {
        const icon = getAssetIcon_new(option.value);
        return (
          <li {...props} key={option.value}>
            <MenuItemContent>
              {icon && <IconWrapper>{icon}</IconWrapper>}
              <span>{option.label}</span>
            </MenuItemContent>
          </li>
        );
      }}
      renderInput={(params) => {
        const icon = selectedOption_new ? getAssetIcon_new(selectedOption_new.value) : null;
        return (
          <TextField
            {...params}
            size='small'
            variant='outlined'
            InputProps={{
              ...params.InputProps,
              startAdornment: icon ? <IconWrapper sx={{ mr: '0.4rem' }}>{icon}</IconWrapper> : null,
            }}
          />
        );
      }}
      disableClearable
    />
  );
};
// We now specify all four generic arguments:
// 1. Option: The type of each item.
// 2. false: For the "Multiple" prop (this is a single-select).
// 3. true: For the "DisableClearable" prop (we want to disable the clear button).
// 4. false: For the "FreeSolo" prop (users can't type custom values).
const StyledAutocomplete = styled(Autocomplete<Option, false, true, false>)(() => ({
  '& .MuiOutlinedInput-root': {
    fontWeight: 500,
  },
  '& + .MuiAutocomplete-popper .MuiAutocomplete-option': {
    padding: '1.2rem 1.6rem',
  },
  // Remove border from the down arrow button
  '& .MuiAutocomplete-popupIndicator': {
    border: 'none',
  },
  '& .MuiAutocomplete-endAdornment': {
    '& .MuiButtonBase-root': {
      border: 'none',
    },
  },
}));
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
