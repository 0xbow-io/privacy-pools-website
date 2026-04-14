'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { alpha, styled, Typography } from '@mui/material';
import { useMigration } from '../hooks/useMigration';

const announcementUrl = process.env.NEXT_PUBLIC_MIGRATION_ANNOUNCEMENT_URL;

export const MigrationBanner = () => {
  const { showBanner } = useMigration();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Add banner height to --header-height so mobile content padding-top accounts for it
  useEffect(() => {
    if (!showBanner) {
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
  }, [showBanner]);

  if (!showBanner) return null;

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
