'use client';

import Link from 'next/link';
import { styled } from '@mui/material/styles';
import { Disclaimer, Logo, Menu, SignInButton } from '~/components';
import { ChainSelect } from '~/components/ChainSelect';
import { MaintenanceBanner } from '~/components/MaintenanceBanner';
import { useAuthContext } from '~/hooks';
import { MigrationBanner } from '~/migration';
import { zIndex } from '~/utils';

export const Header = () => {
  const { isConnected } = useAuthContext();

  return (
    <HeaderWrapper>
      <Disclaimer />
      <MigrationBanner />
      <MaintenanceBanner />

      <StyledHeader>
        <LeftSection>
          <Link href='/'>
            <Logo />
          </Link>
        </LeftSection>
        <Actions>
          <ChainSelect />

          {!isConnected && <SignInButton />}
          {isConnected && <Menu />}
        </Actions>
      </StyledHeader>
    </HeaderWrapper>
  );
};

const HeaderWrapper = styled('div')(({ theme }) => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: zIndex.HEADER,
    [theme.breakpoints.down('sm')]: {
      position: 'fixed',
      top: 0,
      left: 0,
      // solid background so scrolled content doesn't bleed through the
      // semi-transparent migration banner on iOS Safari
      backgroundColor: theme.palette.background.default,
    },
  };
});

const StyledHeader = styled('header')(({ theme }) => {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    zIndex: zIndex.HEADER,
    height: '6rem',
    padding: '1.5rem 2rem',
    borderBottom: '1px solid',
    borderColor: theme.palette.grey[900],
    backgroundColor: theme.palette.background.default,
    boxShadow: `0px 8px 20px 0px ${theme.palette.grey[200]}`,
  };
});

const Actions = styled('div')({
  display: 'flex',
  width: '100%',
  justifyContent: 'end',
  alignItems: 'center',
  gap: '1rem',
});

const LeftSection = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '2.4rem',
});
