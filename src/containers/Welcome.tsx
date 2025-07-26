'use client';

import { Button, Stack, styled, Typography } from '@mui/material';
import { CloseButton } from '~/components';
import { useGoTo } from '~/hooks';
import { ROUTER } from '~/utils';

export const Welcome = () => {
  const goTo = useGoTo();

  const handleCreate = () => {
    goTo(ROUTER.account.children.create);
  };

  const handleImport = () => {
    goTo(ROUTER.account.children.load);
  };

  const handleLogin = () => {
    goTo(ROUTER.account.children.login);
  };

  const back = () => {
    goTo(ROUTER.home.base);
  };

  return (
    <WelcomeContainer>
      <CloseButton back={back} />

      <Stack gap={3} maxWidth='32rem'>
        <Typography variant='h4' fontWeight='bold' align='center' data-testid='welcome-message'>
          Welcome to Privacy Pools
        </Typography>
        <Stack gap={2}>
          <Typography variant='body1' align='center'>
            If you are here for the first time, proceed to: <br />
          </Typography>

          <Typography variant='body1' align='center'>
            <b>Create your Account</b>
          </Typography>

          <Typography variant='body1' align='center'>
            If you already have one: <br />
            <b>Load your Account,</b> either from a <b>Login Key (recommended)</b> or a <b> raw Seed Phrase</b>.
          </Typography>
        </Stack>
      </Stack>
      <Stack gap={2} flexDirection={['column', 'row']}>
        <SButton onClick={handleCreate} data-testid='create-account'>
          Create Account
        </SButton>
        <SButton onClick={handleLogin} data-testid='import-account'>
          Load Account from Login Key
        </SButton>
        <SButton onClick={handleImport} data-testid='import-account'>
          Load Account from Seed
        </SButton>
      </Stack>
    </WelcomeContainer>
  );
};

const WelcomeContainer = styled(Stack)(({ theme }) => ({
  gap: theme.spacing(6),
  height: '100%',
  maxWidth: '48rem',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '18rem',
  position: 'relative',

  [theme.breakpoints.down('sm')]: {
    position: 'inherit',
    marginTop: '6rem',
    maxWidth: '32rem',
  },
}));

const SButton = styled(Button)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  minHeight: '48px',
  padding: '12px 24px',
}));
