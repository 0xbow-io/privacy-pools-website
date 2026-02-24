'use client';

import { ChangeEvent, useState } from 'react';
import { Box, Button, FormHelperText, Stack, styled, TextField, Typography } from '@mui/material';

interface AmountInputSectionProps {
  amount: string;
  errorMessage: string | React.ReactNode;
  handleAmountChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleUseMax: () => void;
  balanceFormatted: string;
  symbol: string;
  poolAccountName: string | undefined;
  balanceUSD: string;
  currentPrice: number | null;
  anonymitySet?: number | null;
  isLoadingAnonymitySet?: boolean;
}

export const AmountInputSection = ({
  amount,
  errorMessage,
  handleAmountChange,
  handleUseMax,
  balanceFormatted,
  symbol,
  poolAccountName,
  currentPrice,
  anonymitySet,
  isLoadingAnonymitySet,
}: AmountInputSectionProps) => {
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);

  const handlePercentageClick = (percentage: number) => {
    if (balanceFormatted) {
      const balance = parseFloat(balanceFormatted);
      const newAmount = (balance * percentage) / 100;
      handleAmountChange({ target: { value: newAmount.toString() } } as ChangeEvent<HTMLInputElement>);
      setSelectedPercentage(percentage);
    }
  };

  const usdAmount = amount && currentPrice ? (Number(amount) * currentPrice).toFixed(2) : null;

  return (
    <Stack width='100%'>
      <InputContainer>
        <Stack direction='column' flex={1} gap='4px'>
          <AmountInput
            placeholder='0'
            value={amount}
            onChange={(e) => {
              handleAmountChange(e as ChangeEvent<HTMLInputElement>);
              setSelectedPercentage(null);
            }}
            inputProps={{ maxLength: 20 }}
          />
          <UsdAmountText>{usdAmount ? `$${usdAmount}` : ''}</UsdAmountText>
        </Stack>

        <Stack direction='column' alignItems='flex-end' gap='8px'>
          {poolAccountName && (
            <BalanceText>
              Balance: {balanceFormatted} {symbol}
            </BalanceText>
          )}
          <Stack direction='row' gap='4px'>
            <PercentButton selected={selectedPercentage === 25} onClick={() => handlePercentageClick(25)}>
              25%
            </PercentButton>
            <PercentButton selected={selectedPercentage === 50} onClick={() => handlePercentageClick(50)}>
              50%
            </PercentButton>
            <PercentButton selected={selectedPercentage === 75} onClick={() => handlePercentageClick(75)}>
              75%
            </PercentButton>
            <PercentButton
              selected={selectedPercentage === 100}
              onClick={() => {
                handleUseMax();
                setSelectedPercentage(100);
              }}
            >
              100%
            </PercentButton>
          </Stack>
        </Stack>
      </InputContainer>

      {amount && !errorMessage && (
        <AnonymitySetText>
          {isLoadingAnonymitySet
            ? 'Loading anonymity set...'
            : anonymitySet !== null && anonymitySet !== undefined
              ? `Your anonymity set is ${anonymitySet}`
              : null}
        </AnonymitySetText>
      )}

      {errorMessage && (
        <FormHelperText error sx={{ marginTop: '8px' }}>
          {errorMessage}
        </FormHelperText>
      )}
    </Stack>
  );
};

const InputContainer = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '16px',
  gap: '16px',
  width: '100%',
  border: '1px solid #E6E6E6',
  borderRadius: '8px',
  backgroundColor: '#FFFFFF',
}));

const AmountInput = styled(TextField)(() => ({
  '& .MuiInputBase-root': {
    fontWeight: 400,
    fontSize: '24px',
    color: '#000000',
    padding: 0,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& input': {
    padding: 0,
  },
}));

const UsdAmountText = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '14px',
  color: '#999999',
}));

const BalanceText = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '14px',
  color: '#999999',
  textAlign: 'right',
}));

const AnonymitySetText = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '14px',
  color: '#666666',
  marginTop: '8px',
}));

const PercentButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  minWidth: '38px',
  width: '38px',
  height: '24px',
  padding: 0,
  background: '#FFFFFF !important',
  border: selected ? '1px solid #737373' : '1px solid #E6E6E6',
  borderRadius: '4px',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: '16px',
  color: '#4D4D4D !important',
  textTransform: 'none',
  '&:hover': {
    background: '#FFFFFF !important',
    border: '1px solid #737373',
    color: '#4D4D4D !important',
  },
}));
