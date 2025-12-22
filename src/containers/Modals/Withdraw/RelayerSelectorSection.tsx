'use client';

import { CircularProgress, Stack, styled, Typography, SelectChangeEvent } from '@mui/material';

type RelayerData = {
  name: string;
  url: string;
  fees?: string;
  isSelectable: boolean;
};

interface RelayerSelectorSectionProps {
  selectedRelayer: { name: string; url: string } | undefined;
  relayersData: RelayerData[];
  handleRelayerChange: (event: SelectChangeEvent<unknown>) => void;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  feeText: string;
  isQuoteValid: boolean;
  countdown: number;
}

export const RelayerSelectorSection = ({
  selectedRelayer,
  isQuoteLoading,
  quoteError,
  feeText,
  isQuoteValid,
  countdown,
}: RelayerSelectorSectionProps) => {
  return (
    <Stack gap='1.2rem' width='100%' alignItems='center'>
      <RelayerLabel>{selectedRelayer?.name || 'Fast Relay'}</RelayerLabel>

      {/* Fee Details */}
      <Stack direction='column' alignItems='flex-start' gap={0.5} width='100%'>
        <Stack direction='row' alignItems='center' gap={1}>
          {isQuoteLoading && <CircularProgress size={16} />}
          <Typography
            variant='body2'
            color={quoteError ? 'error' : feeText === '' && !isQuoteLoading ? 'textSecondary' : 'textSecondary'}
          >
            {feeText}
          </Typography>
        </Stack>
        {isQuoteValid && !isQuoteLoading && (
          <Typography variant='caption' color='textSecondary'>
            (Expires in {countdown}s)
          </Typography>
        )}
      </Stack>
    </Stack>
  );
};

const RelayerLabel = styled(Typography)(({ theme }) => ({
  width: '100%',
  padding: '16px 14px',
  border: `1px solid ${theme.palette.grey[400]}`,
  borderRadius: '4px',
  fontSize: '16px',
  fontWeight: 500,
  color: theme.palette.text.primary,
}));
