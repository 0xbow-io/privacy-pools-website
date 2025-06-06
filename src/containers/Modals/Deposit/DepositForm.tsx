'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { getConstants } from '~/config/constants';
import { useChainContext, useModal, usePoolAccountsContext } from '~/hooks';
import { ModalType } from '~/types';
import { formatDataNumber, getUsdBalance, calculateAspFee, calculateInitialDeposit } from '~/utils';
import { LinksSection } from '../LinksSection';
import { EtherIcon } from '~/assets/coins/ether';

const { ASP_OPTIONS } = getConstants();

export const DepositForm = () => {
  const { setModalOpen } = useModal();
  const [asp, setAsp] = useState(ASP_OPTIONS[0]);
  const {
    balanceBN: { value: balance, symbol, formatted: balanceFormatted, decimals },
    price: currentPrice,
    maxDeposit,
    selectedPoolInfo,
  } = useChainContext();
  const { amount, setAmount, minimumDepositAmount, vettingFeeBPS, isAssetConfigLoading } = usePoolAccountsContext();
  const [inputAmount, setInputAmount] = useState('');

  const balanceUI = formatDataNumber(balance, decimals, 3, false, true, false);
  // const balanceFormatted = formatEther(BigInt(balanceBN));

  const fee = calculateAspFee(parseUnits(amount, decimals), vettingFeeBPS);
  const feeFormatted = formatDataNumber(fee, decimals);
  const feeUSD = getUsdBalance(currentPrice, formatUnits(fee, decimals), decimals);
  const feeText = `Fee ${feeFormatted} ${symbol} ~ ${feeUSD} USD`;

  const isEnoughBalance = parseUnits(amount, decimals) <= parseUnits(balanceFormatted, decimals);
  const isValidAmount = parseUnits(amount, decimals) >= minimumDepositAmount;
  const isMaxAmount = parseUnits(inputAmount, decimals) > BigInt(maxDeposit);
  const amountHasError = !!Number(amount) && (!isValidAmount || !isEnoughBalance);
  const isDepositDisabled =
    !isEnoughBalance || !isValidAmount || amountHasError || isMaxAmount || !asp || isAssetConfigLoading;

  const errorMessage = useMemo(() => {
    if (!inputAmount) return '';
    if (!isValidAmount) return `Minimum deposit amount is ${formatUnits(minimumDepositAmount, decimals)} ${symbol}`;
    if (isMaxAmount) return `Maximum deposit amount is ${formatUnits(BigInt(maxDeposit), decimals)} ${symbol}`;
    if (!isEnoughBalance) return 'Insufficient balance';
    if (amountHasError) return 'Invalid amount';
    return '';
  }, [
    isValidAmount,
    minimumDepositAmount,
    symbol,
    isEnoughBalance,
    amountHasError,
    inputAmount,
    maxDeposit,
    isMaxAmount,
    decimals,
  ]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalizedInput = e.target.value.replace(/[^0-9.]+/g, '').replace(/(\..*)\..*/g, '$1');
    setInputAmount(normalizedInput.slice(0, 6));
  };

  const handleAspChange = (e: SelectChangeEvent<unknown>) => {
    setAsp(e.target.value as string);
  };

  const handleUseMax = () => {
    const maxAllowedAmount = Math.min(Number(formatUnits(BigInt(maxDeposit), decimals)), Number(balanceFormatted));
    setInputAmount(maxAllowedAmount.toString().slice(0, 6));
  };

  const handleDeposit = () => {
    setModalOpen(ModalType.REVIEW);
  };

  const chainIcon = useMemo(() => {
    if (selectedPoolInfo?.asset === 'ETH') {
      return <CoinIcon />;
    }

    if (selectedPoolInfo?.icon) {
      return (
        <ImageContainer>
          <Image src={selectedPoolInfo.icon} alt={symbol} width={54} height={34} />
        </ImageContainer>
      );
    }

    return (
      <ImageContainer>
        <span style={{ width: '5.4rem', height: '5.4rem', backgroundColor: 'transparent' }}></span>
      </ImageContainer>
    );
  }, [selectedPoolInfo?.asset, selectedPoolInfo?.icon, symbol]);

  useEffect(() => {
    const result = calculateInitialDeposit(parseUnits(inputAmount, decimals), vettingFeeBPS);
    setAmount(formatUnits(result, decimals));
  }, [inputAmount, setAmount, vettingFeeBPS, decimals]);

  return (
    <ModalContainer>
      <DecorativeCircle />

      <ModalTitle variant='h2'>Make a deposit</ModalTitle>

      <InputContainer>
        <Stack alignItems='center' flexDirection='column' width='100%'>
          <Stack direction='row' gap='0.8rem' alignItems='center' width='100%'>
            {chainIcon}

            <FormControl className='amount-input'>
              <AmountInput
                id='amount'
                variant='outlined'
                placeholder='0'
                value={inputAmount}
                error={amountHasError}
                onChange={handleAmountChange}
                data-testid='deposit-input'
              />
              <MaxButton onClick={handleUseMax} disableElevation variant='text'>
                Use Max
              </MaxButton>
            </FormControl>
          </Stack>
          {isDepositDisabled && <FormHelperText error>{errorMessage}</FormHelperText>}
        </Stack>

        <BalanceContainer>
          <Typography variant='body1' fontWeight='bold'>{`${balanceUI} ${symbol}`}</Typography>
          <Typography variant='body1'>in your wallet</Typography>
        </BalanceContainer>
      </InputContainer>

      {/* ASP Selector */}
      <Stack gap='1.2rem' width='100%' alignItems='center'>
        <FormControl fullWidth>
          <SSelect id='asp-select' labelId='asp-select-label' value={asp} displayEmpty onChange={handleAspChange}>
            {ASP_OPTIONS.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SSelect>
        </FormControl>

        <Typography variant='body2' color='textSecondary'>
          {feeText}
        </Typography>
      </Stack>

      <Button
        disabled={isDepositDisabled}
        onClick={handleDeposit}
        data-testid='confirm-deposit-button'
        sx={{ zIndex: 1 }}
      >
        Deposit
      </Button>

      <LinksSection />
    </ModalContainer>
  );
};

export const ModalContainer = styled(Box)(() => {
  return {
    display: 'flex',
    padding: '3.6rem 2.4rem',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    '& > *': {
      zIndex: 1,
    },
  };
});

export const CoinIcon = styled(EtherIcon)(({ theme }) => {
  return {
    width: '5.4rem',
    height: '5.4rem',
    padding: '1.2rem',
    borderRadius: '50%',
    borderColor: theme.palette.primary.main,
    borderStyle: 'solid',
    borderWidth: '1px',
    backgroundColor: theme.palette.background.default,
    zIndex: 1,
  };
});

export const MaxButton = styled(Button)(({ theme }) => {
  return {
    padding: '0',
    color: theme.palette.grey[400],
    fontSize: '1.2rem',
    borderRadius: 0,
    minHeight: 'auto',
    height: 'auto',
    textTransform: 'none',
    textDecoration: 'underline',
    textUnderlineOffset: '0.3rem',
    minWidth: 'max-content',
  };
});

export const InputContainer = styled(Stack)(({ theme }) => {
  return {
    border: '1px solid #D9D9D9',
    backgroundColor: theme.palette.background.default,
    padding: '1.6rem',
    width: '100%',
    gap: '1.6rem',

    '.amount-input': {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: 'fit-content',
      borderRadius: '4px',
      border: '1px solid #B8BBBF',
      padding: '0.9rem 1.2rem 1rem',
    },
  };
});

export const AmountInput = styled(TextField)(() => {
  return {
    padding: '0',
    width: '100%',
    '& .MuiOutlinedInput-root': {
      fontSize: '1.6rem',
      width: '100%',
      borderRadius: 0,
      padding: 0,
      '& fieldset, & input': {
        border: 'none',
        padding: 0,
      },
      '&:hover fieldset': {
        border: 'none',
      },
      '&.Mui-focused fieldset': {
        border: 'none',
      },
    },
  };
});

const BalanceContainer = styled(Stack)(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.4rem',
    p: {
      fontSize: '1.4rem',
    },
  };
});

const DecorativeCircle = styled(Box)(({ theme }) => {
  return {
    width: '647px',
    height: '646px',
    position: 'absolute',
    borderRadius: '50%',
    backgroundColor: theme.palette.background.default,
    border: '1px solid #D9D9D9',
    zIndex: 0,
    top: '78%',
  };
});

export const ModalTitle = styled(Typography)(() => {
  return {
    fontSize: '2.4rem',
    fontWeight: 700,
    lineHeight: 'normal',
    width: '100%',
    textAlign: 'center',
  };
});

const SSelect = styled(Select)(() => {
  return {
    width: '100%',
    maxWidth: '32.8rem',
    margin: '0 auto',
    '& .MuiSelect-select': {
      fontWeight: 500,
    },
  };
});

export const ImageContainer = styled(Box)(({ theme }) => {
  return {
    width: '5.4rem',
    height: '5.4rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    borderColor: theme.palette.primary.main,
    borderStyle: 'solid',
    borderWidth: '1px',
    backgroundColor: theme.palette.background.default,
    zIndex: 1,
  };
});
