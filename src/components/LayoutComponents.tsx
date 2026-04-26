'use client';

import { styled } from '@mui/material';
import backgroundImage from '~/assets/background.png';

export const PageWrapper = styled('main')(({ theme }) => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'start',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    height: '100%',
    minHeight: '100vh',
    '@supports (height: 100dvh)': {
      height: '100%',
      minHeight: '100vh',
    },
    backgroundImage: `url(${backgroundImage.src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    [theme.breakpoints.down('sm')]: {
      paddingTop: `calc(var(--header-height) + var(--banner-height, 0px) + var(--maintenance-banner-height, 0px))`,
    },
  };
});

export const NoScriptMessage = styled('noscript')(() => {
  return {
    margin: '0 auto',
    width: '100%',
    textAlign: 'center',
    fontSize: '1.6rem',
    padding: '1rem 0',
    p: {
      padding: '1rem 0',
      margin: 0,
    },
  };
});

export const MainContent = styled('div')(({ theme }) => {
  return {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `0 ${theme.spacing(4)}`,
    [theme.breakpoints.down('sm')]: {
      padding: `${theme.spacing(2)}`,
      maxWidth: '100%',
    },
  };
});
