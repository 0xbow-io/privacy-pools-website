'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from '@carbon/icons-react';
import { Typography, Stack, Box, IconButton } from '@mui/material';
import { ROUTER } from '~/utils';

interface AdvancedNavigationProps {
  title: string;
  isLogged: boolean;
  count: number;
}

export const AdvancedNavigation = ({ title, isLogged, count }: AdvancedNavigationProps) => {
  const { push } = useRouter();
  const searchParams = useSearchParams();

  const handleBack = () => {
    const chainId = searchParams.get('chainId');
    const pool = searchParams.get('pool');
    if (chainId && pool) {
      push(`/pools/${chainId}/${pool.toLowerCase()}`);
    } else {
      push(ROUTER.home.base);
    }
  };

  return (
    <Stack direction='row' justifyContent='space-between' alignItems='center' width='100%'>
      <Box display='flex' alignItems='center' gap={1}>
        <IconButton size='small' onClick={handleBack}>
          <ChevronLeft size={16} />
        </IconButton>
        <Typography variant='subtitle1' fontWeight='bold'>
          {title}
        </Typography>
        {isLogged && count > 0 && (
          <Typography variant='caption' fontWeight='bold' sx={{ mt: '0.2rem' }}>
            ({count})
          </Typography>
        )}
      </Box>
    </Stack>
  );
};
