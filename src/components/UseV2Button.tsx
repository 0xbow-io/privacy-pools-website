'use client';

import { Button } from '@mui/material';
import { V2_LINK_ENABLED, v2LinkHref } from '~/utils/v2Link';

/** Prominent "Use v2" link next to the header logo, styled like the header's Connect button. */
export const UseV2Button = () => {
  if (!V2_LINK_ENABLED) return null;

  return (
    <Button
      data-testid='use-v2-button'
      href={v2LinkHref()}
      target='_blank'
      rel='noopener noreferrer'
      variant='contained'
      disableElevation
      sx={{
        textTransform: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: '100%',
        fontWeight: 600,
        padding: { xs: '0.5rem 1.2rem', sm: '0.5rem 2rem' },
        height: { xs: '2.8rem', sm: '3.2rem' },
        fontSize: { xs: '1.3rem', sm: '1.5rem' },
      }}
    >
      Use v2
    </Button>
  );
};
