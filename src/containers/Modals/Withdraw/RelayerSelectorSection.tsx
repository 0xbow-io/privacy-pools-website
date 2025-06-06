'use client';

import {
  Box,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  styled,
  Typography,
} from '@mui/material';

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
  relayersData,
  handleRelayerChange,
  isQuoteLoading,
  quoteError,
  feeText,
  isQuoteValid,
  countdown,
}: RelayerSelectorSectionProps) => {
  return (
    <Stack gap='1.2rem' width='100%' alignItems='center'>
      <FormControl fullWidth>
        <Select
          id='relayer-select'
          labelId='relayer-select-label'
          value={selectedRelayer?.url ?? ''}
          onChange={handleRelayerChange}
          renderValue={() => selectedRelayer?.name ?? 'Select Relayer'}
          displayEmpty
        >
          {relayersData.map(({ name, url, fees, isSelectable }) => (
            <RelayMenuItem key={name} value={url} disabled={!isSelectable}>
              <Stack direction='row' justifyContent='space-between' alignItems='center' width='100%'>
                <Box>
                  <Typography variant='body2'>{name}</Typography>
                  {fees !== undefined && (
                    <Typography variant='caption' color='textSecondary'>
                      Base Fee: {Number(fees) / 100}%
                    </Typography>
                  )}
                </Box>
                {!isSelectable && (
                  <Typography variant='caption' color='error'>
                    Unavailable
                  </Typography>
                )}
              </Stack>
            </RelayMenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Fee Details */}
      <Stack direction='column' alignItems='center' gap={0.5}>
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

const RelayMenuItem = styled(MenuItem)({
  '&.Mui-disabled': {
    opacity: 0.5,
    span: {
      fontWeight: 700,
    },
  },
});
