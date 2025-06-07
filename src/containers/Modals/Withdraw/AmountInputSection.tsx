'use client';

import { ChangeEvent, ReactNode } from 'react';
import { FormControl, FormHelperText, Stack, Typography } from '@mui/material';
import { AmountInput, MaxButton } from '~/containers/Modals/Deposit';

interface AmountInputSectionProps {
  amount: string;
  errorMessage: string;
  handleAmountChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleUseMax: () => void;
  balanceFormatted: string;
  symbol: string;
  poolAccountName: string | undefined;
  balanceUSD: string;
  chainIcon: ReactNode;
}

export const AmountInputSection = ({
  amount,
  errorMessage,
  handleAmountChange,
  handleUseMax,
  balanceFormatted,
  symbol,
  poolAccountName,
  balanceUSD,
  chainIcon,
}: AmountInputSectionProps) => {
  return (
    <Stack alignItems='center' width='100%' gap='1.6rem'>
      <Stack direction='row' alignItems='center' width='100%' flexDirection='column'>
        <Stack direction='row' gap='0.8rem' alignItems='center' width='100%'>
          {chainIcon}

          <FormControl className='amount-input'>
            <AmountInput
              id='amount'
              variant='outlined'
              placeholder='0'
              value={amount}
              error={!!errorMessage && amount !== ''}
              onChange={handleAmountChange}
              data-testid='withdrawal-amount-input'
              inputProps={{ maxLength: 20 }}
            />
            <MaxButton onClick={handleUseMax} disableElevation variant='text'>
              Use Max
            </MaxButton>
          </FormControl>
        </Stack>
        {errorMessage && <FormHelperText error>{errorMessage}</FormHelperText>}
      </Stack>

      {poolAccountName && (
        <Stack gap='0' alignItems='center'>
          {' '}
          <Typography variant='body2'>
            <b>{`${balanceFormatted} ${symbol}`}</b> in PA-{poolAccountName}
          </Typography>
          <Typography variant='caption' color='textDisabled'>
            ~ {balanceUSD} USD
          </Typography>
        </Stack>
      )}
    </Stack>
  );
};
