'use client';

import { Button, styled } from '@mui/material';
import { V2_LINK_ENABLED, v2LinkHref } from '~/utils/v2Link';

/** Prominent "Use v2" link next to the header logo, styled like the header's Connect button. */
export const UseV2Button = () => {
  if (!V2_LINK_ENABLED) return null;

  return (
    <SButton
      data-testid='use-v2-button'
      href={v2LinkHref()}
      target='_blank'
      rel='noopener noreferrer'
      variant='contained'
      disableElevation
    >
      Use v2
    </SButton>
  );
};

const SButton = styled(Button)(({ theme }) => ({
  textTransform: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  padding: '0.5rem 2rem',
  lineHeight: '100%',
  height: '3.2rem',
  fontSize: '1.5rem',
  fontWeight: 600,
  [theme.breakpoints.down('sm')]: {
    padding: '0.5rem 1.2rem',
    height: '2.8rem',
    fontSize: '1.3rem',
  },
}));
