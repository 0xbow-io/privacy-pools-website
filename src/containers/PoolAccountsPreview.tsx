'use client';

import { useRouter } from 'next/navigation';
import { Stack, Typography, Button, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { AssetSelect, PoolAccountTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { Section, PAContainer, EthText, Subtitle, ActionMenuContainer } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useAdvancedView, useChainContext } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER } from '~/utils';
import { ActionMenu } from './ActionMenu';

export const PoolAccountsPreview = () => {
  const { push } = useRouter();
  const {
    balanceBN: { symbol, decimals },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const {
    poolsByAssetAndChain,
    allPools,
    amountPoolAsset,
    pendingAmountPoolAsset,
    hideEmptyPools,
    toggleHideEmptyPools,
  } = useAccountContext();
  const { previewPoolAccounts } = useAdvancedView();
  const { setModalOpen } = useModal();
  const { isLogged, isConnected, isAuthorized } = useAuthContext();
  const goTo = useGoTo();

  const handleShowEmptyPools = () => {
    toggleHideEmptyPools();
  };

  const handleLogin = () => {
    goTo(ROUTER.account.base);
  };

  const handleConnect = () => {
    setModalOpen(ModalType.CONNECT);
  };

  const handleNavigateToPoolAccounts = () => {
    push(ROUTER.poolAccounts.base);
  };

  return (
    <>
      <PAContainer>
        <Section width='100%'>
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            width='100%'
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={1}
              width='100%'
            >
              <Stack direction='row' alignItems='center' gap={1}>
                <Typography variant='subtitle1' fontWeight='bold' lineHeight='1' whiteSpace='nowrap'>
                  Pool Accounts
                </Typography>
                {isLogged && allPools > 0 && (
                  <Typography variant='caption' fontWeight='bold' mt='0.2rem'>
                    ({allPools})
                  </Typography>
                )}
                <InfoTooltip message='These are your active deposits in Privacy Pools and their status.' />
              </Stack>

              <Stack direction='row' alignItems='center' gap={1} width='12rem'>
                <AssetSelect />
              </Stack>
            </Stack>

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              alignItems={{ xs: 'flex-end', sm: 'center' }}
              gap={1}
              width='100%'
              justifyContent='flex-end'
            >
              {previewPoolAccounts.length > 0 && (
                <ViewAllButton onClick={handleShowEmptyPools} disabled={!poolsByAssetAndChain.length}>
                  <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
                </ViewAllButton>
              )}

              {isAuthorized && previewPoolAccounts.length > 0 && (
                <ViewAllButton
                  onClick={handleNavigateToPoolAccounts}
                  disabled={poolsByAssetAndChain && !poolsByAssetAndChain.length}
                >
                  <ViewAllText>View All</ViewAllText>
                </ViewAllButton>
              )}
            </Stack>
          </Stack>

          {isLogged && (
            <Stack flexDirection='row' justifyContent='space-between' width='100%'>
              <Stack width='50%' gap={1}>
                <Subtitle variant='caption'>Available:</Subtitle>
                <EthText variant='subtitle1' fontWeight='bold'>
                  {formatUnits(amountPoolAsset, assetDecimals || decimals)}
                  <span> {symbol}</span>
                </EthText>
              </Stack>

              <Stack width='50%' gap={1}>
                <Subtitle variant='caption'>Being validated:</Subtitle>
                <EthText variant='subtitle1' fontWeight='bold'>
                  {formatUnits(pendingAmountPoolAsset, assetDecimals || decimals)}
                  <span> {symbol}</span>
                </EthText>
              </Stack>
            </Stack>
          )}
        </Section>

        {isLogged && (
          <>
            <PoolAccountTable records={previewPoolAccounts} />

            <ActionMenuContainer>
              <ActionMenu />
            </ActionMenuContainer>
          </>
        )}

        {!isConnected && (
          <ActionMenuContainer sx={{ minHeight: '13.2rem' }}>
            <Stack
              padding='1rem'
              width='100%'
              flexDirection={['column', 'row']}
              justifyContent='center'
              alignItems='center'
              gap='0.6rem'
            >
              <ConnectText variant='caption' onClick={handleConnect}>
                Connect Wallet
              </ConnectText>
              <STypography variant='caption'>to Sign in and Deposit</STypography>
            </Stack>
          </ActionMenuContainer>
        )}

        {isConnected && !isLogged && (
          <ActionMenuContainer sx={{ minHeight: '13.2rem' }}>
            <Stack
              padding='1rem'
              width='100%'
              flexDirection={['column', 'row']}
              justifyContent='center'
              gap='0.6rem'
              alignItems='center'
            >
              <ConnectText variant='caption' onClick={handleLogin}>
                Create or Load
              </ConnectText>
              <STypography variant='caption'>an Account</STypography>
            </Stack>
          </ActionMenuContainer>
        )}
      </PAContainer>
    </>
  );
};

const STypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 400,
  lineHeight: '1.25',
}));

export const ViewAllText = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textUnderlineOffset: '0.3rem',
  textDecorationColor: theme.palette.grey[400],
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: '1.2rem',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));

const ConnectText = styled(STypography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '0.3rem',
  lineHeight: '1.25',
  cursor: 'pointer',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));

export const ViewAllButton = styled(Button)(({ theme }) => ({
  border: 'none',
  background: 'none',
  padding: 0,
  height: 'unset',
  '&:hover': {
    border: 'none',
    background: 'none',
  },
  '&:focus': {
    background: 'none',
    border: 'none',
  },
  '&:disabled': {
    background: 'none',
    border: 'none',
  },
  '&:hover, &:focus': {
    color: theme.palette.grey[900],
  },
}));
