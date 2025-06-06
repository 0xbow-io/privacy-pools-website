import Link from 'next/link';
import { Launch } from '@carbon/icons-react';
import {
  Stack,
  styled,
  Table,
  TableBody,
  TableCell as TableCellBase,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import { formatUnits } from 'viem';
import { StatusChip } from '~/components';
import { usePoolAccountsContext, useChainContext, useAccountContext } from '~/hooks';
import { EventType, ReviewStatus } from '~/types';
import { getTimeAgo, truncateAddress } from '~/utils';

export const WithdrawalsTable = () => {
  const {
    chain,
    balanceBN: { decimals },
  } = useChainContext();
  const explorerUrl = chain.explorerUrl;
  const { poolAccount } = usePoolAccountsContext();
  const { historyData } = useAccountContext();
  const theme = useTheme();
  const rows = historyData.filter(
    (row) => (row.type === EventType.WITHDRAWAL || row.type === EventType.EXIT) && row.label === poolAccount?.label,
  );

  return (
    <Container>
      <Stack direction='row' justifyContent='space-between' alignItems='center' width='100%' padding='1.6rem'>
        <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
          Withdrawal History
        </Typography>
      </Stack>
      {!!rows.length && (
        <STableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <HTableCell sx={{ paddingLeft: 0 }}>Action</HTableCell>
                <HTableCell>Value</HTableCell>
                {/* <HTableCell>To</HTableCell> */}
                <HTableCell>Tx Link</HTableCell>
                <HTableCell>Time</HTableCell>
                <HStatusCell sx={{ paddingRight: 0 }}>Status</HStatusCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row, index) => (
                <STableRow key={row.txHash + index}>
                  {/* Action */}
                  <STableCell sx={{ paddingLeft: 0 }}>
                    {row.type === EventType.WITHDRAWAL ? 'Withdraw' : 'Exit'}
                  </STableCell>

                  {/* Value */}
                  <STableCell>{formatUnits(row.amount as bigint, decimals)}</STableCell>

                  {/* To */}
                  {/* Temporarily disabled */}
                  {/* <STableCell>
                    <TxLink href={`${explorerUrl}/address/${row.address}`} target='_blank'>
                      {truncateAddress(row.address)}
                      <Image src={launchIcon} alt='launch' width={16} height={16} />
                    </TxLink>
                  </STableCell> */}

                  {/* Tx Link */}
                  <STableCell sx={{ textTransform: 'none' }}>
                    <TxLink href={`${explorerUrl}/tx/${row.txHash}`} target='_blank'>
                      {truncateAddress(row.txHash)}
                      <Launch size={16} color={theme.palette.text.disabled} />
                    </TxLink>
                  </STableCell>

                  {/* Tx Link */}
                  <STableCell sx={{ textTransform: 'none' }}>{getTimeAgo(row.timestamp?.toString() ?? '')}</STableCell>

                  {/* Status */}
                  <StatusCell sx={{ paddingRight: 0 }}>
                    <StatusChip status={ReviewStatus.APPROVED} compact />
                  </StatusCell>
                </STableRow>
              ))}
            </TableBody>
          </Table>
        </STableContainer>
      )}

      {!rows.length && (
        <STableContainer>
          <Stack alignItems='center' justifyContent='center' height='100%'>
            <Typography variant='body2' color='textDisabled'>
              Your activity will appear here when there&apos;s something to show.
            </Typography>
          </Stack>
        </STableContainer>
      )}
    </Container>
  );
};

const Container = styled(Stack)(({ theme }) => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid',
  borderColor: theme.palette.grey[900],
}));

const TableCell = styled(TableCellBase)(({ theme }) => ({
  padding: '0.4rem 1rem',
  borderTop: '1px solid',
  borderBottom: 'unset',
  borderColor: theme.palette.grey[200],
}));

const STableContainer = styled(TableContainer)(() => ({
  padding: '0.8rem 1.6rem',
  borderTop: '1px solid',
  maxHeight: '20rem',
}));

const STableRow = styled(TableRow)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[200],
}));

const STableCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.grey[600],
  fontSize: '1.2rem',
  fontWeight: 400,
  textTransform: 'capitalize',
  margin: 0,
}));

const HTableCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  borderTop: 'unset',
}));

const HStatusCell = styled(HTableCell)(() => ({
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StatusCell = styled(TableCell)(() => ({
  display: 'flex',
  justifyContent: 'center',
  alignContent: 'center',
  fontSize: '1.2rem',
  fontWeight: 400,
  padding: '0.85rem 1rem',
  margin: '0',
  border: 'none',
}));

const TxLink = styled(Link)(() => ({
  textTransform: 'none',
  width: 'fit-content',
  color: 'inherit',
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'start',
  gap: '0.4rem',
  '& svg': {
    opacity: '0',
  },
  '&:hover': {
    fontWeight: 700,
    '& svg': {
      opacity: 1,
    },
  },
}));
