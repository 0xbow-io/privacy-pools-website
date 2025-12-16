import { Stack, styled, Typography } from '@mui/material';

type LinksSectionProps = {
  context?: 'deposit' | 'withdrawal' | 'ragequit';
};

const FAQ_URLS = {
  deposit: 'https://docs.privacypools.com/protocol/deposit',
  withdrawal: 'https://docs.privacypools.com/protocol/withdrawal',
  ragequit: 'https://docs.privacypools.com/protocol/ragequit',
} as const;

export const LinksSection = ({ context = 'deposit' }: LinksSectionProps) => {
  return (
    <Container gap='1.2rem' width='100%' alignItems='' direction='row' justifyContent='center'>
      <Typography variant='body1' component='a' href={FAQ_URLS[context]} target='_blank'>
        FAQ
      </Typography>
      <Divider />
      <Typography
        variant='body1'
        component='a'
        href='https://docs.google.com/forms/d/e/1FAIpQLSe0UKiTrZ4kD0apx75bEW0PWqJxpd6bCYh_IUKBrCkJOBzkpQ/viewform'
        target='_blank'
      >
        Support
      </Typography>
    </Container>
  );
};

const Container = styled(Stack)(({
  theme: {
    palette: { grey },
  },
}) => {
  return {
    display: 'flex',
    flexDirection: 'row',
    gap: '1.2rem',
    width: '100%',
    justifyContent: 'center',
    zIndex: 0,
    alignItems: 'center',

    a: {
      fontSize: '1.2rem',
      minWidth: '5rem',
      textAlign: 'center',
      color: grey[600],
      textDecoration: 'none',
      cursor: 'pointer',
    },
  };
});

const Divider = styled('span')(({ theme }) => ({
  width: '1px',
  height: '16px',
  backgroundColor: theme.palette.grey[300],
}));
