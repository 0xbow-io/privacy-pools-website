import { Checkmark, Copy, Link as LinkIcon } from '@carbon/icons-react';
import { IconButton, styled, Link, Stack } from '@mui/material';
import { useChainContext, usePoolAccountsContext } from '~/hooks';
import { useClipboard } from '~/utils';
import { Label } from './DataSection';

export const Transaction = () => {
  const { selectedHistoryData } = usePoolAccountsContext();
  const {
    chain: { explorerUrl },
  } = useChainContext();
  const { copied, copyToClipboard } = useClipboard({ timeout: 1000 });

  const handleCopy = () => {
    if (selectedHistoryData?.txHash) {
      copyToClipboard(selectedHistoryData.txHash);
    }
  };

  const handleLink = () => {
    window.open(`${explorerUrl}/tx/${selectedHistoryData?.txHash}`, '_blank');
  };

  return (
    <Container>
      <Label variant='body2'>Transaction:</Label>

      <Stack direction='row' gap='0.8rem' justifyContent='space-between'>
        <StyledLink href={`${explorerUrl}/tx/${selectedHistoryData?.txHash}`} target='_blank'>
          {selectedHistoryData?.txHash}
        </StyledLink>

        <Stack direction='row' gap='0.8rem'>
          <IconButton onClick={handleLink}>
            <LinkIcon size={16} />
          </IconButton>

          <IconButton onClick={handleCopy}>{copied ? <Checkmark size={16} /> : <Copy size={16} />}</IconButton>
        </Stack>
      </Stack>
    </Container>
  );
};

const Container = styled(Stack)(() => ({
  gap: '0.6rem',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  flexWrap: 'wrap',
}));

const StyledLink = styled(Link)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1rem',
  fontStyle: 'normal',
  fontWeight: 300,
  lineHeight: '150%',
  wordBreak: 'break-all',
  maxWidth: '20rem',
  '&:hover': {
    color: theme.palette.grey[900],
    fontWeight: 600,
  },
}));
