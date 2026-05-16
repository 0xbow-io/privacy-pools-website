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
        <RelayerSelect
          id='relayer-select'
          labelId='relayer-select-label'
          value={selectedRelayer?.url ?? ''}
          onChange={handleRelayerChange}
          renderValue={() => selectedRelayer?.name ?? 'Select Relayer'}
          displayEmpty
        >
          {relayersData.map(({ name, url, fees, isSelectable }) => (
            <RelayMenuItem key={url} value={url} disabled={!isSelectable}>
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
        </RelayerSelect>
      </FormControl>

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

const RelayerSelect = styled(Select)(({ theme }) => ({
  '& .MuiSelect-select': {
    padding: '16px 14px',
    fontSize: '16px',
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.grey[400],
  },
}));

const RelayMenuItem = styled(MenuItem)({
  '&.Mui-disabled': {
    opacity: 0.5,
    span: {
      fontWeight: 700,
    },
  },
});
