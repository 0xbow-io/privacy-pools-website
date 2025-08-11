'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useNotifications } from '~/hooks';
import { useSafeApp } from '~/hooks/useSafeApp';

interface SafeAppWrapperProps {
  children: ReactNode;
}

export const SafeAppWrapper = ({ children }: SafeAppWrapperProps) => {
  const { isSafeApp, isLoading, safe } = useSafeApp();
  const { addNotification } = useNotifications();
  const notificationShownRef = useRef(false);

  useEffect(() => {
    if (isSafeApp && safe && !notificationShownRef.current) {
      addNotification('info', `Connected to Safe: ${safe.safeAddress.slice(0, 6)}...${safe.safeAddress.slice(-4)}`);
      notificationShownRef.current = true;
    }
  }, [isSafeApp, safe, addNotification]);

  // Show loading state while determining Safe App status
  if (isLoading) {
    return (
      <Box display='flex' flexDirection='column' alignItems='center' justifyContent='center' minHeight='200px' gap={2}>
        {isSafeApp ? <CircularProgress /> : null}
        <Typography variant='body2' color='text.secondary'>
          {isSafeApp ? 'Initializing Safe App...' : 'Initializing...'}
        </Typography>
      </Box>
    );
  }

  // If we're in a Safe App, show Safe-specific info
  if (isSafeApp && safe) {
    return <>{children}</>;
  }

  // Regular app mode
  return <>{children}</>;
};
