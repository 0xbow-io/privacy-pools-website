'use client';

import { useEffect, useRef, useState } from 'react';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { alpha, Box, IconButton, keyframes, styled, Typography } from '@mui/material';
import {
  shouldShowV2Banner,
  V2_BANNER_DISMISSED_KEY,
  V2_BANNER_ENABLED,
  V2_DEPOSIT_CAP_LABEL,
  v2BannerHref,
} from '~/utils/v2Banner';

/**
 * Invitation to try Privacy Pools V2, at the very top of the page.
 *
 * Monochrome on purpose: the site is black-and-white IBM Plex Mono, so the
 * banner borrows the theme's grey scale (a soft gradient one step off the page
 * background) rather than a coloured stripe, and gets its "look at me" from a
 * single high-contrast button and a slow shimmer along its bottom rule. The
 * shimmer is off under prefers-reduced-motion. Dismissal is remembered for a
 * fortnight (utils/v2Banner.ts), and the banner publishes its height as
 * --v2-banner-height so the fixed mobile header keeps content below it, the
 * same contract the maintenance and migration banners use.
 */
export const V2InviteBanner = () => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(V2_BANNER_DISMISSED_KEY);
    } catch {
      raw = null;
    }
    setVisible(shouldShowV2Banner({ enabled: V2_BANNER_ENABLED, raw, now: Date.now() }));
  }, []);

  useEffect(() => {
    if (!visible) {
      document.body.style.removeProperty('--v2-banner-height');
      return;
    }
    const update = () => {
      const h = bannerRef.current?.offsetHeight ?? 0;
      document.body.style.setProperty('--v2-banner-height', `${h}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.style.removeProperty('--v2-banner-height');
    };
  }, [visible]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(V2_BANNER_DISMISSED_KEY, String(Date.now()));
    } catch {
      // storage unavailable: hide for this page view only
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Root ref={bannerRef} role='region' aria-label='Privacy Pools V2 is live in preview' data-testid='v2-invite-banner'>
      <Content>
        <Tag>Preview</Tag>
        <Copy variant='body2'>
          <strong>Privacy Pools V2 is live in preview.</strong>
          <span> Shield, send, swap, withdraw and earn.</span>
          {V2_DEPOSIT_CAP_LABEL && <span> Deposits capped at {V2_DEPOSIT_CAP_LABEL} for now.</span>}
        </Copy>
        <Cta href={v2BannerHref()} target='_blank' rel='noopener noreferrer'>
          Try V2
          <ArrowForwardRoundedIcon sx={{ fontSize: '1.5rem' }} />
        </Cta>
      </Content>
      <Dismiss size='small' onClick={handleDismiss} aria-label='Dismiss the Privacy Pools V2 invitation'>
        <CloseRoundedIcon fontSize='small' />
      </Dismiss>
      <Shimmer aria-hidden='true' />
    </Root>
  );
};

const sweep = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const Root = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === 'dark';
  const from = dark ? theme.palette.grey[800] : theme.palette.grey[100];
  const to = theme.palette.background.default;
  return {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.2rem',
    padding: '1rem 5.6rem 1rem 2rem',
    overflow: 'hidden',
    background: `linear-gradient(90deg, ${from} 0%, ${to} 50%, ${from} 100%)`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    [theme.breakpoints.down('sm')]: {
      padding: '1rem 4.8rem 1rem 1.6rem',
    },
  };
});

const Content = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: '1.2rem 1.6rem',
  maxWidth: '112rem',
  [theme.breakpoints.down('sm')]: {
    gap: '0.8rem 1.2rem',
  },
}));

const Tag = styled('span')(({ theme }) => ({
  flex: 'none',
  fontSize: '1rem',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  lineHeight: 1,
  padding: '0.5rem 0.7rem 0.4rem',
  border: `1px solid ${theme.palette.text.primary}`,
  color: theme.palette.text.primary,
  borderRadius: theme.borderRadius?.sm ?? '4px',
}));

const Copy = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontSize: '1.4rem',
  lineHeight: 1.45,
  color: theme.palette.text.secondary,
  '& strong': {
    color: theme.palette.text.primary,
    fontWeight: 600,
  },
  [theme.breakpoints.down('sm')]: {
    fontSize: '1.3rem',
    flexBasis: '100%',
    textAlign: 'center',
  },
}));

const Cta = styled('a')(({ theme }) => ({
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.7rem 1.2rem 0.7rem 1.4rem',
  fontSize: '1.3rem',
  fontWeight: 600,
  lineHeight: 1,
  textDecoration: 'none',
  color: theme.palette.background.default,
  backgroundColor: theme.palette.text.primary,
  border: `1px solid ${theme.palette.text.primary}`,
  borderRadius: theme.borderRadius?.sm ?? '4px',
  transition: 'background-color 160ms ease, color 160ms ease, transform 160ms ease',
  '&:hover, &:focus-visible': {
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
    transform: 'translateY(-1px)',
    outline: 'none',
  },
  '& svg': {
    transition: 'transform 160ms ease',
  },
  '&:hover svg': {
    transform: 'translateX(3px)',
  },
}));

const Dismiss = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: '1.2rem',
  top: '50%',
  transform: 'translateY(-50%)',
  color: theme.palette.text.secondary,
  padding: '0.4rem',
  '&:hover': {
    color: theme.palette.text.primary,
  },
}));

// A 1px light that travels along the bottom rule every few seconds: enough
// life to catch the eye, no colour, and none at all for reduced motion.
const Shimmer = styled('span')(({ theme }) => ({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '1px',
  pointerEvents: 'none',
  background: `linear-gradient(90deg, transparent 0%, ${alpha(theme.palette.text.primary, 0.55)} 50%, transparent 100%)`,
  animation: `${sweep} 6s ease-in-out infinite`,
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    display: 'none',
  },
}));
