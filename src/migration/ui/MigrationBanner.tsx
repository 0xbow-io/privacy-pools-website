'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { alpha, IconButton, styled, Typography } from '@mui/material';
import { useMigration } from '../hooks/useMigration';

const announcementUrl = process.env.NEXT_PUBLIC_MIGRATION_ANNOUNCEMENT_URL;
const DISMISSED_KEY = 'migration-banner-dismissed';

export const MigrationBanner = () => {
  const { showBanner } = useMigration();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const isVisible = showBanner && dismissed === false;

  // Add banner height to --banner-height so mobile content padding-top accounts for it
  useEffect(() => {
    if (!isVisible) {
      document.body.style.removeProperty('--banner-height');
      return;
    }
    const update = () => {
      const h = bannerRef.current?.offsetHeight ?? 0;
      document.body.style.setProperty('--banner-height', `${h}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.style.removeProperty('--banner-height');
    };
  }, [isVisible]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  if (!isVisible) return null;

  return (
    <BannerRoot ref={bannerRef}>
      <WarningAmberRoundedIcon fontSize='small' />
      <BannerText variant='body2'>
        We strengthened our key generation entropy.
        {announcementUrl && (
          <AnnouncementLink href={announcementUrl} target='_blank' rel='noopener noreferrer'>
            Learn more
          </AnnouncementLink>
        )}
      </BannerText>
      <DismissButton size='small' onClick={handleDismiss} aria-label='Dismiss announcement'>
        <CloseRoundedIcon fontSize='small' />
      </DismissButton>
    </BannerRoot>
  );
};

const BannerRoot = styled('div')(({ theme }) => ({
  width: '100%',
  backgroundColor: alpha(theme.palette.warning.main, 0.12),
  borderBottom: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
  padding: '1.2rem 2rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  color: theme.palette.warning.main,
}));

const BannerText = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontSize: '1.4rem',
  color: theme.palette.text.primary,
}));

const AnnouncementLink = styled(Link)(({ theme }) => ({
  marginLeft: '0.6rem',
  color: theme.palette.warning.dark,
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '0.3rem',
}));

const DismissButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.primary,
  padding: '0.4rem',
  marginLeft: '0.4rem',
}));
