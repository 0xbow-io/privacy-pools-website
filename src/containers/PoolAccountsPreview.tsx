'use client';

import { Stack, Typography, Button, styled } from '@mui/material';
import { InfoTooltip } from '~/components/InfoTooltip';
import { Section, PAContainer, ActionMenuContainer } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER } from '~/utils';
import { ActionMenu } from './ActionMenu';
import { UserPoolsStats } from './UserPoolsStats';

export const PoolAccountsPreview = () => {
  const { allPools } = useAccountContext();
  const { setModalOpen } = useModal();
  const { isLogged, isConnected } = useAuthContext();
  const goTo = useGoTo();

  const handleLogin = () => {
    goTo(ROUTER.account.base);
  };

  const handleConnect = () => {
    setModalOpen(ModalType.CONNECT);
  };

  return (
    <>
      <PAContainer>
        <Section width='100%'>
          <Stack direction='row' alignItems='center' gap={1}>
            <Typography variant='subtitle1' fontWeight='bold' lineHeight='1' whiteSpace='nowrap'>
              {isConnected ? 'My Pools' : 'Pool Accounts'}
            </Typography>
            {isLogged && allPools > 0 && (
              <Typography variant='caption' fontWeight='bold' mt='0.2rem'>
                ({allPools})
              </Typography>
            )}
            <InfoTooltip message='These are your active deposits in Privacy Pools and their status.' />
          </Stack>
        </Section>

        {isLogged && (
          <>
            <UserPoolsStats />

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
