'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { styled } from '@mui/material/styles';
import { Disclaimer, Logo, Menu, SignInButton } from '~/components';
import { ChainSelect } from '~/components/ChainSelect';
import { useAuthContext } from '~/hooks';
import { zIndex } from '~/utils';

export const Header = () => {
  const { isConnected } = useAuthContext();
  const pathname = usePathname();

  const isPoolsActive = pathname === '/';
  const isStatsActive = pathname === '/stats';

  return (
    <HeaderWrapper>
      <Disclaimer />

      <StyledHeader>
        <LeftSection>
          <Link href='/'>
            <Logo />
          </Link>
          <NavLinks>
            <NavLink href='/' active={isPoolsActive ? 'true' : 'false'}>
              Pools
            </NavLink>
            <NavLink href='/stats' active={isStatsActive ? 'true' : 'false'}>
              Stats
            </NavLink>
          </NavLinks>
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

const NavLinks = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '2rem',
});

const NavLink = styled(Link, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: string }>(({ active }) => ({
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '100%',
  color: '#000000',
  textDecoration: 'none',
  textDecorationLine: active === 'true' ? 'underline' : 'none',
  '&:hover': {
    opacity: 0.7,
  },
}));
