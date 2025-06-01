'use client';

import { useState, MouseEvent, useMemo } from 'react';
import { OverflowMenuVertical } from '@carbon/icons-react';
import {
  styled,
  Table,
  TableBody,
  TableCell as TableCellBase,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  useTheme,
  useMediaQuery,
  Typography,
  Box,
} from '@mui/material';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { DottedMenu, ExtendedTooltip as Tooltip, StatusChip } from '~/components';
import { getConstants } from '~/config/constants';
import { usePoolAccountsContext, useModal, useChainContext, useAccountContext } from '~/hooks';
import { EventType, ModalType, PoolAccount, ReviewStatus } from '~/types';
import { formatDataNumber, formatTimestamp } from '~/utils';

export const PoolAccountTable = ({ records }: { records: PoolAccount[] }) => {
  const { PENDING_STATUS_MESSAGE: statusMessage } = getConstants();
  const { setActionType, setPoolAccount, setAmount, setTarget } = usePoolAccountsContext();
  const {
    chain: { decimals, symbol },
  } = useChainContext();
  const { address } = useAccount();
  const { setModalOpen } = useModal();
  const { poolAccounts, isLoading } = useAccountContext();
  const [anchorEl, setAnchorEl] = useState<(HTMLElement | null)[]>([]);

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { setSelectedHistoryData } = usePoolAccountsContext();

  const handleToggle = (event: MouseEvent<HTMLElement>, index: number) => {
    const newAnchorEl = Array(poolAccounts.length).fill(null);
    newAnchorEl[index] = anchorEl[index] ? null : event.currentTarget;
    setAnchorEl(newAnchorEl);
  };

  const handleWithdraw = (poolAccount: PoolAccount) => {
    setActionType(EventType.WITHDRAWAL);
    setModalOpen(ModalType.WITHDRAW);
    const foundAccount = poolAccounts.find((pa) => pa.label === poolAccount.label);
    if (!foundAccount) return;

    setPoolAccount(foundAccount);
    handleClose();
  };

  const handleExit = (poolAccount: PoolAccount) => {
    if (!address) return;
    const foundAccount = poolAccounts.find((pa) => pa.label === poolAccount.label);
    if (!foundAccount) return;

    setTarget(address);
    setPoolAccount(foundAccount);
    setAmount(formatEther(poolAccount.balance));
    setActionType(EventType.EXIT);
    setModalOpen(ModalType.GENERATE_ZK_PROOF);
    handleClose();
  };

  const handleDetails = (poolAccount: PoolAccount) => {
    const foundAccount = poolAccounts.find((pa) => pa.label === poolAccount.label);
    if (!foundAccount) return;

    setSelectedHistoryData({
      type: EventType.DEPOSIT,
      amount: poolAccount.deposit.value,
      txHash: poolAccount.deposit.txHash,
      timestamp: poolAccount.deposit.timestamp ? parseInt(poolAccount.deposit.timestamp.toString()) : 0,
      reviewStatus: poolAccount.reviewStatus,
      label: poolAccount.label,
    });
    setPoolAccount(foundAccount);
    setModalOpen(ModalType.PA_DETAILS);
    handleClose();
  };

  const handleClose = () => {
    setAnchorEl(Array(poolAccounts.length).fill(null));
  };

  const getRowReviewStatus = useMemo(
    () => (row: PoolAccount) => {
      return row.reviewStatus === ReviewStatus.APPROVED && row.balance === 0n ? ReviewStatus.SPENT : row.reviewStatus;
    },
    [],
  );

  const getExitHandler = (row: PoolAccount) => {
    return row.balance !== 0n ? () => handleExit(row) : undefined;
  };

  const getWithdrawHandler = (row: PoolAccount) => {
    return row.balance !== 0n && row.reviewStatus === ReviewStatus.APPROVED ? () => handleWithdraw(row) : undefined;
  };

  if (isLoading) {
    return (
      <STableContainer>
        <Box display='flex' justifyContent='center' alignItems='center' height='65.3px'>
          <Typography variant='body2' color='textDisabled'>
            Loading...
          </Typography>
        </Box>
      </STableContainer>
    );
  }

  return (
    <>
      {!!poolAccounts.length && (
        <STableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <HTableCell sx={{ paddingLeft: 0 }}>Account</HTableCell>
                <HTableCell>Value</HTableCell>
                <HTableCell>Created</HTableCell>
                <HTableCell sx={{ paddingRight: 0 }}>Status</HTableCell>
                <HTableCell align='right'></HTableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {records?.map((row) => (
                <STableRow key={row.label.toString()}>
                  {/* Temporary hardcoded pool account identifier */}
                  <STableCell sx={{ paddingLeft: 0 }}>{`PA-${row.name}`}</STableCell>

                  <STableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={formatEther(row.balance)} placement='top' disableInteractive>
                      <Typography variant='caption'>{`${formatDataNumber(row.balance, decimals, 3, false, true, false)} ${symbol}`}</Typography>
                    </Tooltip>
                  </STableCell>

                  <STableCell>
                    {mobile
                      ? formatTimestamp(row.deposit.timestamp?.toString() ?? '').slice(0, 10)
                      : formatTimestamp(row.deposit.timestamp?.toString() ?? '')}
                  </STableCell>

                  <STableCell sx={{ paddingRight: mobile ? 0 : '1rem', textAlign: 'center' }}>
                    <Tooltip
                      title={getRowReviewStatus(row) === ReviewStatus.PENDING ? statusMessage : ''}
                      placement='top'
                      disableInteractive
                    >
                      <StatusChip status={getRowReviewStatus(row)} compact={mobile} />
                    </Tooltip>
                  </STableCell>

                  <MenuCell align='right' onClick={(e) => handleToggle(e, row.name - 1)} data-testid='dotted-menu'>
                    <SIconButton>
                      <OverflowMenuVertical size={16} />
                    </SIconButton>
                  </MenuCell>

                  <DottedMenu
                    open={!!anchorEl[row.name - 1]}
                    anchorEl={anchorEl[row.name - 1]}
                    handleExit={getExitHandler(row)}
                    handleClose={handleClose}
                    handleDetails={() => handleDetails(row)}
                    handleWithdraw={getWithdrawHandler(row)}
                  />
                </STableRow>
              ))}
            </TableBody>
          </Table>
        </STableContainer>
      )}
    </>
  );
};

export const TableCell = styled(TableCellBase)(({ theme }) => ({
  padding: '0.4rem 1rem',
  borderTop: '1px solid',
  borderBottom: 'unset',
  borderColor: theme.palette.grey[200],
}));

export const MenuCell = styled(TableCell)(() => ({
  padding: '0.4rem 0rem',
}));

export const STableContainer = styled(TableContainer)(() => ({
  padding: '0.8rem 1.6rem',
  borderTop: '1px solid',
}));

export const STableRow = styled(TableRow)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[200],
  '& > *': {
    cursor: 'default',
  },
}));

export const STableCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.grey[600],
  fontSize: '1.2rem',
  fontWeight: 400,
  textTransform: 'capitalize',
  margin: 0,
}));

export const HTableCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: '1rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  width: '30%',
  borderTop: 'unset',
}));

const SIconButton = styled(IconButton)(({ theme }) => ({
  backgroundColor: 'transparent',
  border: 'none',
  color: theme.palette.text.primary,
  '&:hover, &:focus': {
    backgroundColor: 'transparent',
    color: theme.palette.text.disabled,
    border: 'none',
  },
}));
