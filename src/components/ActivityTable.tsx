'use client';

import { Button, Table, TableBody, TableHead, TableRow, TableCell, styled, Typography, Stack } from '@mui/material';
import { formatUnits } from 'viem';
import {
  ExtendedTooltip as Tooltip,
  HTableCell,
  STableCell,
  STableContainer,
  STableRow,
  StatusChip,
} from '~/components';
import { chainData, getConfig } from '~/config';
import { usePoolAccountsContext, useModal, useChainContext, useAccountContext } from '~/hooks';
import { ActivityRecords, GlobalEvent, HistoryData, ModalType, ReviewStatus } from '~/types';
import { formatDataNumber, getTimeAgo, getStatus } from '~/utils';

const {
  constants: { ITEMS_PER_PAGE, PENDING_STATUS_MESSAGE },
} = getConfig();

export const ActivityTable = ({
  records,
  isLoading,
  isError,
  onRetry,
  view,
  size = 'large',
}: {
  records: ActivityRecords;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  view?: 'personal' | 'global';
  size?: 'small' | 'large';
}) => {
  const { setModalOpen } = useModal();
  const {
    balanceBN: { decimals, symbol },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const { poolAccounts, poolAccountsByChainScope } = useAccountContext();
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

  const isGlobalEvent = (row: ActivityRecords[number]): row is GlobalEvent => {
    return 'pool' in row && row.pool !== undefined;
  };

  const formatAmount = (row: ActivityRecords[number]) => {
    // For global events, use pool info from the event itself
    if (isGlobalEvent(row)) {
      const eventDecimals = parseInt(row.pool.denomination, 10) || 18;
      return `${formatDataNumber(BigInt(getAmount(row) || 0), eventDecimals, 3, false, true, false)} ${row.pool.tokenSymbol}`;
    }
    // For personal activity, look up the pool info by scope to get correct asset symbol and decimals
    if (view === 'personal' && 'scope' in row) {
      // Find the pool info by scope across all chains
      for (const chain of Object.values(chainData)) {
        const poolInfo = chain.poolInfo.find((p: { scope: bigint }) => p.scope === row.scope);
        if (poolInfo) {
          return `${formatDataNumber(BigInt(getAmount(row) || 0), poolInfo.assetDecimals || 18, 3, false, true, false)} ${poolInfo.asset}`;
        }
      }
    }
    // Fallback to current pool's symbol
    return `${formatDataNumber(BigInt(getAmount(row) || 0), assetDecimals || decimals, 3, false, true, false)} ${symbol}`;
  };

  const formatTime = (row: ActivityRecords[number]) => {
    return getTimeAgo(row.timestamp?.toString() ?? '');
  };

  const handleDetails = (row: HistoryData[number]) => {
    setSelectedHistoryData(row);
    setModalOpen(ModalType.ACTIVITY_DETAILS);
  };

  const isPersonalEvents = view === 'personal';

  const getPoolAccountName = (row: HistoryData[number]) => {
    if (!isPersonalEvents) return 'N/A';

    let poolAccount = poolAccounts.find((pa) => pa.label === row.label);

    if (!poolAccount && 'scope' in row && 'chainId' in row) {
      const key = `${row.chainId}-${row.scope}`;
      const accounts = poolAccountsByChainScope[key] || [];
      poolAccount = accounts.find((pa) => pa.label === row.label);
    }

    return poolAccount ? `PA-${poolAccount.name}` : 'N/A';
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
                      title={(() => {
                        // For global events, use pool info from the event
                        if (isGlobalEvent(row)) {
                          const eventDecimals = parseInt(row.pool.denomination, 10) || 18;
                          return formatUnits(BigInt(getAmount(row) || 0), eventDecimals);
                        }
                        // For personal activity, look up the correct decimals by scope
                        if (view === 'personal' && 'scope' in row) {
                          for (const chain of Object.values(chainData)) {
                            const poolInfo = chain.poolInfo.find((p: { scope: bigint }) => p.scope === row.scope);
                            if (poolInfo) {
                              return formatUnits(
                                getAmount(row as ActivityRecords[number]) as bigint,
                                poolInfo.assetDecimals || 18,
                              );
                            }
                          }
                        }
                        // Fallback to current pool's decimals
                        return formatUnits(
                          getAmount(row as ActivityRecords[number]) as bigint,
                          assetDecimals || decimals,
                        );
                      })()}
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
                      title={
                        getStatus(row) === ReviewStatus.PENDING
                          ? PENDING_STATUS_MESSAGE
                          : getStatus(row) === ReviewStatus.POI_REQUIRED
                            ? 'Proof of Association needed'
                            : getStatus(row)
                      }
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
          <Stack alignItems='center' justifyContent='center' width='100%' height={tableBodyHeight} gap='1.2rem'>
            <Typography variant='body2' color='textDisabled'>
              {isLoading ? 'Loading...' : isError ? "Couldn't load activity." : noRecordsMessage}
            </Typography>
            {!isLoading && isError && onRetry && (
              <Button variant='outlined' size='small' onClick={onRetry}>
                Retry
              </Button>
            )}
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
