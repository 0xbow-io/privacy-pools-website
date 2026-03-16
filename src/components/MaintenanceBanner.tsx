'use client';

import { Box, Typography, styled } from '@mui/material';

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
const MAINTENANCE_MESSAGE =
  process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE ||
  'We are currently in maintenance mode. Withdrawals may be limited. Exit remains available at all times.';

export const MaintenanceBanner = () => {
  if (!MAINTENANCE_MODE) return null;

  return (
    <Banner>
      <BannerText>{MAINTENANCE_MESSAGE}</BannerText>
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
  zIndex: 1000,
}));

const BannerText = styled(Typography)(() => ({
  fontSize: '13px',
  fontWeight: 500,
  color: '#664D03',
  textAlign: 'center',
  lineHeight: '1.4',
}));
