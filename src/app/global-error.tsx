'use client';

import { useEffect } from 'react';
import { Stack, Typography, styled, Button, CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import * as Sentry from '@sentry/nextjs';
import { PageWrapper } from '~/components';
import { getConfig } from '~/config';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line
    Sentry.captureException(error);
  }, [error]);
  const muiTheme = getConfig().customThemes.getMui;

  return (
    <html>
      <body>
        <MuiThemeProvider theme={muiTheme} defaultMode={'light'} disableTransitionOnChange>
          <CssBaseline enableColorScheme />
          <SPageWrapper>
            <Stack gap={6} alignItems='center' px={6} justifyContent='center' maxWidth='48rem'>
              <Typography variant='h3' align='center' color='error' textTransform='capitalize'>
                {error.name}
              </Typography>

              <Typography variant='body1' color='text.secondary' textAlign='center'>
                {error.message}
              </Typography>
              <Button onClick={reset}>Try again</Button>
            </Stack>
          </SPageWrapper>
        </MuiThemeProvider>
      </body>
    </html>
  );
}

const SPageWrapper = styled(PageWrapper)({
  alignItems: 'center',
  justifyContent: 'center',
  margin: 'auto',
});
