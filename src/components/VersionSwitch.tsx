'use client';

import { styled } from '@mui/material/styles';
import { V2_LINK_ENABLED, V2_APP_URL } from '~/utils/v2Link';

/**
 * Small v1 | v2 segmented switch next to the header logo. This site is v1, so
 * v1 is the selected side and v2 is a plain link to the v2 site, flagged NEW!.
 */
export const VersionSwitch = () => {
  if (!V2_LINK_ENABLED) return null;

  return (
    <Wrapper data-testid='version-switch'>
      <Segments role='group' aria-label='Privacy Pools version'>
        <Selected aria-current='page' aria-label='Privacy Pools v1, current site'>v1</Selected>
        <Option
          href={V2_APP_URL}
          target='_blank'
          rel='noopener noreferrer'
          aria-label='Privacy Pools v2, opens v2.privacypools.com'
        >
          v2
        </Option>
      </Segments>
      <NewBadge>NEW!</NewBadge>
    </Wrapper>
  );
};

const Wrapper = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexShrink: 0,
});

const Segments = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  height: '2.6rem',
  padding: '0.2rem',
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  borderRadius: '0.8rem',
}));

const segment = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: '0 0.8rem',
  borderRadius: '0.6rem',
  fontSize: '1.2rem',
  lineHeight: 1,
  textDecoration: 'none',
  whiteSpace: 'nowrap' as const,
};

const Selected = styled('span')(({ theme }) => ({
  ...segment,
  fontWeight: 700,
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.text.primary,
}));

const Option = styled('a')(({ theme }) => ({
  ...segment,
  color: theme.palette.text.primary,
  opacity: 0.7,
  '&:hover': { opacity: 1 },
}));

const NewBadge = styled('span')(({ theme }) => ({
  fontSize: '1rem',
  fontWeight: 700,
  lineHeight: 1,
  padding: '0.3rem 0.5rem',
  borderRadius: '0.4rem',
  whiteSpace: 'nowrap',
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.text.primary,
}));
