'use client';

import { Table, TableBody, TableHead, TableRow, TableCell, styled, Typography, Stack } from '@mui/material';
import { formatUnits } from 'viem';
import {
  ExtendedTooltip as Tooltip,
  HTableCell,
  STableCell,
  STableContainer,
  STableRow,
  StatusChip,
} from '~/components';
import { getConfig } from '~/config';
import { usePoolAccountsContext, useModal, useChainContext, useAccountContext } from '~/hooks';
import { ActivityRecords, EventType, HistoryData, ModalType, ReviewStatus } from '~/types';
import { formatDataNumber, getTimeAgo } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE, PENDING_STATUS_MESSAGE },
} = getConfig();

export const ActivityTable = ({
  records,
  isLoading,
  view,
  size = 'large',
}: {
  records: ActivityRecords;
  isLoading?: boolean;
  view?: 'personal' | 'global';
  size?: 'small' | 'large';
}) => {
  const { setModalOpen } = useModal();
  const {
    balanceBN: { decimals, symbol },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const { poolAccounts } = useAccountContext();
  const { setSelectedHistoryData } = usePoolAccountsContext();
  const noRecordsMessage =
    view === 'personal' ? "Your activity will appear here when there's something to show." : 'No activity found';

  const getAmount = (row: ActivityRecords[number]) => {
    if ('amount' in row) {
      return row.amount;
    }
    // @ts-expect-error the event fetched from ASP should have publicAmount, but now the response has a custom type (returns amount)
    return row.publicAmount;
  };

  const formatAmount = (row: ActivityRecords[number]) => {
    return `${formatDataNumber(BigInt(getAmount(row) || 0), assetDecimals || decimals, 3, false, true, false)} ${symbol}`;
  };

  const formatTime = (row: ActivityRecords[number]) => {
    return getTimeAgo(row.timestamp?.toString() ?? '');
  };

  const handleDetails = (row: HistoryData[number]) => {
    setSelectedHistoryData(row);
    setModalOpen(ModalType.ACTIVITY_DETAILS);
  };

  const getStatus = (row: ActivityRecords[number]) => {
    if (row.type === EventType.WITHDRAWAL) {
      return ReviewStatus.APPROVED;
    }
    return row.reviewStatus;
  };

  const isPersonalEvents = view === 'personal';

  const getPoolAccountName = (row: HistoryData[number]) => {
    const poolAccount = poolAccounts.find((poolAccount) => poolAccount.label === row.label);
    return isPersonalEvents ? (poolAccount ? `PA-${poolAccount.name}` : 'N/A') : 'N/A';
  };

  const rowHeight = 28.45;
  const tableBodyHeight = size === 'small' ? 6 * rowHeight : ITEMS_PER_PAGE * rowHeight;

  return (
    <>
      {!!records.length && (
        <STableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <HeaderCell sx={{ paddingLeft: 0 }}>Action</HeaderCell>
                {isPersonalEvents && <HeaderCell>Pool Account</HeaderCell>}
                <HeaderCell>Value</HeaderCell>
                <HeaderCell>Time</HeaderCell>
                <HStatusCell sx={{ paddingRight: 0 }}>Status</HStatusCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {records.map((row, index) => (
                <ActivityTableRow key={row.txHash + index} onClick={() => handleDetails(row as HistoryData[number])}>
                  {/* Action */}
                  <STableCell sx={{ paddingLeft: 0 }}>{row.type}</STableCell>

                  {/* Pool Account */}
                  {isPersonalEvents && (
                    <STableCell>
                      <Typography variant='caption'>{getPoolAccountName(row as HistoryData[number])}</Typography>
                    </STableCell>
                  )}

                  {/* Value */}
                  <STableCell>
                    <Tooltip
                      title={formatUnits(
                        getAmount(row as ActivityRecords[number]) as bigint,
                        assetDecimals || decimals,
                      )}
                      placement='top'
                      disableInteractive
                    >
                      <Typography variant='caption'>{formatAmount(row)}</Typography>
                    </Tooltip>
                  </STableCell>

                  {/* Time */}
                  <STableCell sx={{ textTransform: 'none' }}>
                    <Typography variant='caption'>{formatTime(row)}</Typography>
                  </STableCell>

                  {/* Status */}
                  <StatusCell sx={{ paddingRight: 0 }}>
                    <Tooltip
                      title={getStatus(row) === ReviewStatus.PENDING ? PENDING_STATUS_MESSAGE : getStatus(row)}
                      disableInteractive
                      placement='top'
                    >
                      <StatusChip status={getStatus(row)} compact />
                    </Tooltip>
                  </StatusCell>
                </ActivityTableRow>
              ))}
            </TableBody>
          </Table>
        </STableContainer>
      )}

      {!records.length && (
        <STableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <HTableCell sx={{ paddingLeft: 0 }}>Action</HTableCell>
                <HTableCell>Value</HTableCell>
                <HTableCell>Time</HTableCell>
                <HStatusCell sx={{ paddingRight: 0 }}>Status</HStatusCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <STableRow></STableRow>
            </TableBody>
          </Table>
          <Stack alignItems='center' justifyContent='center' width='100%' height={tableBodyHeight}>
            <Typography variant='body2' color='textDisabled'>
              {isLoading ? 'Loading...' : noRecordsMessage}
            </Typography>
          </Stack>
        </STableContainer>
      )}
    </>
  );
};

const HeaderCell = styled(HTableCell)(() => ({
  width: 'unset',
}));

const HStatusCell = styled(HTableCell)(() => ({
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StatusCell = styled(TableCell)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignContent: 'center',
  fontSize: '1.2rem',
  fontWeight: 400,
  padding: '0.85rem 1rem',
  margin: '0',
  borderTop: '1px solid',
  borderBottom: 'unset',
  borderColor: theme.palette.grey[200],
}));

const ActivityTableRow = styled(TableRow)(({ theme }) => ({
  cursor: 'pointer',

  '&:hover': {
    'td, span': {
      color: theme.palette.grey[900],
      fontWeight: 600,
    },
  },
}));
