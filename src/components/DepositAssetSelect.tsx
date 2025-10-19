'use client';

import Image from 'next/image';
import { Autocomplete, TextField, styled } from '@mui/material';
import { useAccount } from 'wagmi';
import { ChainAssets } from '~/config';
import { useModal, usePoolAccountsContext, useAccountContext } from '~/hooks';
import { useChainContext } from '~/hooks/context/useChainContext';
import { EventType, ModalType } from '~/types';
import { Option } from './AssetSelect';

const ALL_TOKEN_OPTIONS: Option[] = [
  { value: 'ETH', label: 'ETH' },
  { value: 'wstETH', label: 'wstETH' },
  { value: 'wBTC', label: 'wBTC' },
  { value: 'USDC', label: 'USDC' },
  { value: 'USDT', label: 'USDT' },
  { value: 'USDS', label: 'USDS' },
  { value: 'sUSDS', label: 'sUSDS' },
  { value: 'USDe', label: 'USDe' },
  { value: 'USD1', label: 'USD1' },
  { value: 'FRXUSD', label: 'FRXUSD' },
  { value: 'DAI', label: 'DAI' },
];

export const DepositAssetSelect: React.FC = () => {
  const { selectedAsset, chain, maxDeposit } = useChainContext();
  const { setModalOpen } = useModal();
  const { setActionType } = usePoolAccountsContext();
  const { seed } = useAccountContext();
  const { address } = useAccount();

  const supportedAssets = [...new Set(chain.poolInfo.map((pool) => pool.asset))];
  const filteredTokenOptions = ALL_TOKEN_OPTIONS.filter((option) => supportedAssets.includes(option.value));

  const getAssetIcon = (asset: ChainAssets) => {
    const poolWithAsset = chain.poolInfo.find((pool) => pool.asset === asset);
    return poolWithAsset?.icon ? (
      <Image src={poolWithAsset.icon} alt={asset} width={20} height={20} style={{ width: '100%', height: '100%' }} />
    ) : null;
  };

  const selectedOption = filteredTokenOptions.find((option) => option.value === selectedAsset);
  const isDepositDisabled = !address || !seed || !BigInt(maxDeposit);

  const handleChange = (_event: React.SyntheticEvent, newValue: Option | null) => {
    if (newValue) {
      // Just open the deposit modal without changing the global selected asset
      // The deposit modal will handle asset selection internally
      setModalOpen(ModalType.DEPOSIT);
      setActionType(EventType.DEPOSIT);
    }
  };

  return (
    <StyledDepositAutocomplete
      fullWidth
      value={selectedOption || undefined}
      onChange={handleChange}
      options={filteredTokenOptions}
      getOptionLabel={(option) => option.label}
      disabled={isDepositDisabled}
      renderOption={(props, option) => {
        const icon = getAssetIcon(option.value);
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
        return (
          <TextField
            {...params}
            size='small'
            variant='outlined'
            placeholder='token'
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <DepositLabel
                  onClick={(e) => {
                    e.preventDefault();
                    // Trigger the popup to open
                    const autocompleteElement = e.currentTarget.closest('.MuiAutocomplete-root');
                    const popupButton = autocompleteElement?.querySelector(
                      '.MuiAutocomplete-popupIndicator',
                    ) as HTMLButtonElement;
                    if (popupButton) {
                      popupButton.click();
                    }
                  }}
                >
                  Deposit
                </DepositLabel>
              ),
            }}
          />
        );
      }}
      disableClearable
      data-testid='deposit-button'
    />
  );
};

// Styled Autocomplete with black button styling
const StyledDepositAutocomplete = styled(Autocomplete<Option, false, true, false>)(({ theme }) => ({
  minWidth: '140px',
  '& .MuiOutlinedInput-root': {
    backgroundColor: theme.palette.common.black,
    color: theme.palette.common.white,
    fontWeight: 500,
    height: '40px',
    borderRadius: '4px',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.common.black,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.grey[700],
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.grey[600],
    },
    '&.Mui-disabled': {
      backgroundColor: theme.palette.action.disabledBackground,
      color: theme.palette.text.disabled,
    },
  },
  '& .MuiAutocomplete-input': {
    color: theme.palette.common.white,
    '&::placeholder': {
      color: theme.palette.grey[400],
      opacity: 1,
    },
  },
  '& .MuiAutocomplete-popupIndicator': {
    color: theme.palette.common.white,
    backgroundColor: 'transparent',
    border: 'none',
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    '&.Mui-focusVisible': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
  },
  '& .MuiAutocomplete-endAdornment': {
    '& .MuiButtonBase-root': {
      border: 'none',
    },
  },
  '& + .MuiAutocomplete-popper .MuiAutocomplete-option': {
    padding: '12px 16px',
  },
}));

const MenuItemContent = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
}));

const IconWrapper = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  '& > img': {
    width: '100%',
    height: '100%',
  },
}));

const DepositLabel = styled('span')(({ theme }) => ({
  color: theme.palette.common.white,
  fontWeight: 500,
  marginRight: '4px',
  marginLeft: '8px',
  cursor: 'pointer',
  '&:hover': {
    opacity: 0.8,
  },
}));
