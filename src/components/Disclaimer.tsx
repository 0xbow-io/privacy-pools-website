'use client';

import { useState } from 'react';
import { Close } from '@carbon/icons-react';
import { IconButton, styled, Typography } from '@mui/material';
import { getEnv } from '~/config/env';
import { HEADER_HEIGHT } from '~/utils';

const { SHOW_DISCLAIMER } = getEnv();

export const Disclaimer = () => {
  const [showDisclaimer, setShowDisclaimer] = useState(SHOW_DISCLAIMER);

  const closeDisclaimer = () => {
    setShowDisclaimer(false);
    document.body.style.setProperty('--header-height', HEADER_HEIGHT + 'rem');
  };

  if (!showDisclaimer) return null;

  return (
    <Container>
      <Typography variant='caption'>
        Deposits are temporarily frozen pending a bugfix. Please see: https://x.com/0xprivacypools
      </Typography>
      <SIconButton size='small' onClick={closeDisclaimer}>
        <Close size={20} />
      </SIconButton>
    </Container>
  );
};

export const Container = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '1rem',
  width: '100%',
  borderBottom: '1px solid',
  padding: '0.6rem 2rem 0.6rem',
  borderColor: theme.palette.grey[400],
  backgroundColor: theme.palette.background.default,
  span: {
    lineHeight: 1.3,
    fontWeight: 500,
  },
}));

const SIconButton = styled(IconButton)(({ theme }) => ({
  backgroundColor: 'transparent',
  border: 'none',
  color: theme.palette.text.primary,
  '&:hover, &:focus': {
    backgroundColor: 'transparent',
    color: theme.palette.text.disabled,
    border: 'none',
  },
}));
