'use client';

import { useEffect, useRef, useState } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, IconButton, Typography, styled } from '@mui/material';

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
const MAINTENANCE_MESSAGE =
  process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE ||
  'We are currently in maintenance mode. Withdrawals may be limited. Exit remains available at all times.';
const DISMISSED_KEY = 'maintenance-banner-dismissed';

export const MaintenanceBanner = () => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const isVisible = MAINTENANCE_MODE && dismissed === false;

  useEffect(() => {
    if (!isVisible) {
      document.body.style.removeProperty('--maintenance-banner-height');
      return;
    }
    const update = () => {
      const h = bannerRef.current?.offsetHeight ?? 0;
      document.body.style.setProperty('--maintenance-banner-height', `${h}px`);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.style.removeProperty('--maintenance-banner-height');
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
    <Banner ref={bannerRef}>
      <BannerText>{MAINTENANCE_MESSAGE}</BannerText>
      <DismissButton size='small' onClick={handleDismiss} aria-label='Dismiss maintenance notice'>
        <CloseRoundedIcon fontSize='small' />
      </DismissButton>
    </Banner>
  );
};

const Banner = styled(Box)(() => ({
  width: '100%',
  backgroundColor: '#FFF3CD',
  borderBottom: '1px solid #FFECB5',
  padding: '10px 20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '0.8rem',
  zIndex: 1000,
}));

const BannerText = styled(Typography)(() => ({
  fontSize: '13px',
  fontWeight: 500,
  color: '#664D03',
  textAlign: 'center',
  lineHeight: '1.4',
}));

const DismissButton = styled(IconButton)(() => ({
  color: '#664D03',
  padding: '0.4rem',
}));
