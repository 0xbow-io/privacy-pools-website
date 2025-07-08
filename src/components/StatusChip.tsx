'use client';

import { Box, styled } from '@mui/material';
import { ReviewStatus } from '~/types';

type StatusObject = {
  id?: string;
  decisionStatus?: ReviewStatus;
  reviewStatus?: ReviewStatus;
  status?: ReviewStatus;
  reason?: string;
  processed?: boolean;
  createdAt?: string;
  adminId?: string;
  depositId?: string;
  [key: string]: string | boolean | ReviewStatus | undefined;
};

export const StatusChip = ({
  status = ReviewStatus.PENDING,
  compact = false,
  ...props
}: {
  status?: ReviewStatus | StatusObject;
  compact?: boolean;
} & Record<string, unknown>) => {
  // Handle case where status is an object with decisionStatus property
  let statusValue: ReviewStatus;
  let displayValue: string;

  if (typeof status === 'object' && status !== null) {
    // If status is an object, try to extract the actual status value
    // Based on error message, object has: {id, decisionStatus, reason, processed, createdAt, adminId, depositId}
    const extractedStatus = status.decisionStatus || status.reviewStatus || status.status;

    if (extractedStatus && typeof extractedStatus === 'string') {
      statusValue = extractedStatus as ReviewStatus;
      displayValue = extractedStatus;
    } else {
      statusValue = ReviewStatus.PENDING;
      displayValue = ReviewStatus.PENDING;
    }

    console.warn('StatusChip received object instead of string:', {
      receivedObject: status,
      extractedStatus,
      usingStatus: statusValue,
      availableKeys: Object.keys(status),
    });
  } else if (typeof status === 'string') {
    statusValue = status as ReviewStatus;
    displayValue = status;
  } else {
    statusValue = ReviewStatus.PENDING;
    displayValue = ReviewStatus.PENDING;
    console.warn('StatusChip received invalid status type:', typeof status, status);
  }

  return (
    <SStatusChip {...props} status={statusValue} className={compact ? 'compact' : ''}>
      {!compact && displayValue}
    </SStatusChip>
  );
};

export const SStatusChip = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'status',
})<{ status: ReviewStatus }>(({ theme, status }) => {
  const statusColorMap = {
    approved: theme.palette.success,
    pending: theme.palette.warning,
    declined: theme.palette.error,
    exited: {
      main: theme.palette.grey[500],
      light: theme.palette.grey[100],
    },
    spent: {
      main: theme.palette.grey[600],
      light: theme.palette.grey[50],
    },
  };

  // Defensive programming: fallback to pending style if status not found
  const statusStyle = statusColorMap[status];

  if (!statusStyle) {
    console.warn(
      `StatusChip: Unknown status "${status}", falling back to pending style. Available statuses:`,
      Object.keys(statusColorMap),
    );
  }

  const finalStatusStyle = statusStyle || statusColorMap.pending;

  return {
    display: 'inline-block',
    textTransform: 'capitalize',
    padding: '4px 12px',
    borderRadius: '1.2rem',
    fontSize: '1rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    border: '1px solid',
    borderColor: finalStatusStyle.main,
    background: finalStatusStyle.light,
    cursor: 'inherit',

    '&.compact': {
      padding: 0,
      borderRadius: '50%',
      width: '1rem',
      height: '1rem',
    },
  };
});
