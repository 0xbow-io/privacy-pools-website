'use client';

import { Box, Typography, styled } from '@mui/material';

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
const MAINTENANCE_MESSAGE =
  process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE ||
  "We are currently investigating an SDK bug that we're in the process of fixing, but we suspect there might have been an attempt to exploit it. To be safe, please ragequit your funds. We froze all deposits & withdrawals so only ragequits are available at this time - the funds can only be withdrawn back to your address, so there isn't any additional urgent risk - but we do want to confirm that your funds are safe.";

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
