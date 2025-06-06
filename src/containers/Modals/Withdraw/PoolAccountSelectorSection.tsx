'use client';

import { FormControl, MenuItem, Select, SelectChangeEvent, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { PoolAccount, ReviewStatus } from '~/types';

interface PoolAccountSelectorSectionProps {
  poolAccountName: string | undefined;
  handlePoolAccountChange: (event: SelectChangeEvent<unknown>) => void;
  filteredPoolAccounts: PoolAccount[];
  decimals: number;
  symbol: string;
}

export const PoolAccountSelectorSection = ({
  poolAccountName,
  handlePoolAccountChange,
  filteredPoolAccounts,
  decimals,
  symbol,
}: PoolAccountSelectorSectionProps) => {
  return (
    <FormControl fullWidth>
      <StyledSelect
        id='pool-account-select'
        labelId='pool-account-select-label'
        value={poolAccountName || ''}
        onChange={handlePoolAccountChange}
        displayEmpty
      >
        {filteredPoolAccounts.map((value) => {
          if (value.reviewStatus === ReviewStatus.APPROVED) {
            return (
              <SMenuItem key={value.name} value={value.name.toString()}>
                PA-{value.name}{' '}
                <span className='eth-value'>
                  {formatUnits(value.balance, decimals)} {symbol}
                </span>
              </SMenuItem>
            );
          }
          return null;
        })}
      </StyledSelect>
    </FormControl>
  );
};

const StyledSelect = styled(Select)({
  '.eth-value': {
    fontWeight: 700,
  },
});

const SMenuItem = styled(MenuItem)({
  '.eth-value': {
    fontWeight: 700,
    marginLeft: '0.8rem',
  },
});
